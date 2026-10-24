"""Independent single-process TG gateway. Run from this directory."""
import asyncio
import contextlib
import io
import json
import logging
import os
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from PIL import Image
from auth import user_id

TOKEN = os.environ.get("TG_BOT_TOKEN", "")
BASE = os.environ.get("TG_PUBLIC_URL", "").rstrip("/")
ALLOWED = {int(x) for x in os.environ.get("TG_ALLOWED_USERS", "").split(",") if x.strip()}
MAX_BYTES = 20 * 1024 * 1024
jobs = {}  # Metadata only; expires after one hour, lost on restart.
client = None
log = logging.getLogger("tg-crop")


async def api(method, data=None, files=None):
    response = await client.post(f"https://api.telegram.org/bot{TOKEN}/{method}", data=data, files=files)
    payload = response.json()
    if not payload.get("ok"):
        raise RuntimeError("Telegram request failed")  # Never log token-bearing URLs.
    return payload["result"]


def cleanup():
    for key in list(jobs):
        if jobs[key]["expires"] < time.time():
            jobs.pop(key, None)


async def message(msg):
    if msg.get("chat", {}).get("type") != "private":
        return
    uid = msg["from"]["id"]
    if ALLOWED and uid not in ALLOWED:
        return
    chat = msg["chat"]["id"]
    media = msg.get("document") or (msg.get("photo") or [None])[-1]
    if not media:
        await api("sendMessage", {"chat_id": chat, "text": "发一张图片给我，再点调整四角。高清图片请选择文件／不压缩发送。支持 JPEG、PNG、WebP；最大 20 MB、1600 万像素。图片会经过机器人服务器中转。"})
        return
    if media.get("file_size", MAX_BYTES + 1) > MAX_BYTES or ("document" in msg and media.get("mime_type") not in {"image/jpeg", "image/png", "image/webp"}):
        await api("sendMessage", {"chat_id": chat, "text": "请发送 20 MB 以内的 JPEG、PNG 或 WebP 图片。"})
        return
    cleanup()
    if len(jobs) >= 500 or sum(j["uid"] == uid for j in jobs.values()) >= 10:
        await api("sendMessage", {"chat_id": chat, "text": "待处理任务较多，请稍后再试（任务一小时过期）。"})
        return
    key = secrets.token_urlsafe(24)
    jobs[key] = {"uid": uid, "chat": chat, "file": media["file_id"], "expires": time.time()+3600, "sent": False, "lock": asyncio.Lock()}
    try:
        await api("sendMessage", {"chat_id": chat, "text": "点击调整四角，裁剪后可发回高清 PNG。入口一小时有效。", "reply_markup": json.dumps({"inline_keyboard": [[{"text": "调整四角", "web_app": {"url": f"{BASE}/?tg_job={key}"}}]]})})
    except Exception:
        jobs.pop(key, None)
        raise


async def poll():
    offset = 0
    while True:
        try:
            cleanup()
            updates = await api("getUpdates", {"offset": offset, "timeout": 25, "allowed_updates": '["message"]'})
            for update in updates:
                try:
                    if "message" in update:
                        await message(update["message"])
                except Exception:
                    log.warning("Could not process an incoming message; ask user to resend")
                offset = update["update_id"] + 1
        except Exception:
            log.warning("Telegram polling unavailable; retrying")
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app):
    global client
    if not TOKEN or not BASE.startswith("https://"):
        raise RuntimeError("Set TG_BOT_TOKEN and HTTPS TG_PUBLIC_URL")
    async with httpx.AsyncClient(timeout=40) as client:
        await api("getMe")
        info = await api("getWebhookInfo")
        if info.get("url"):
            raise RuntimeError("Bot has an existing webhook; use a dedicated bot")
        task = asyncio.create_task(poll())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)


@app.middleware("http")
async def privacy(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def authorize(request, key):
    try:
        uid = user_id(request.headers.get("X-Telegram-Init-Data", ""), TOKEN)
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, "请从机器人重新打开，登录有效期一小时")
    cleanup()
    job = jobs.get(key)
    if not job or job["uid"] != uid or (ALLOWED and uid not in ALLOWED):
        raise HTTPException(404, "任务已过期，请重新发图")
    return job


def check_image(data, png=False):
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.format not in ({"PNG"} if png else {"JPEG", "PNG", "WEBP"}):
                raise ValueError()
            if min(img.size) < 50 or max(img.size) > 8192 or img.width*img.height > 16000000:
                raise ValueError()
            mime = Image.MIME[img.format]
            img.verify()
            return mime
    except Exception:
        raise HTTPException(400, "图片格式无效或超过 1600 万像素／8192 单边限制")


@app.get("/api/jobs/{key}/image")
async def image(key: str, request: Request):
    job = authorize(request, key)
    async with job["lock"]:
        try:
            meta = await api("getFile", {"file_id": job["file"]})
            if meta.get("file_size", MAX_BYTES+1) > MAX_BYTES:
                raise HTTPException(413, "图片超过 20 MB")
            data = bytearray()
            async with client.stream("GET", f"https://api.telegram.org/file/bot{TOKEN}/{meta['file_path']}") as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_BYTES:
                        raise HTTPException(413, "图片超过 20 MB")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(502, "读取 TG 图片失败，请重试")
        mime = await asyncio.to_thread(check_image, data)
        return Response(bytes(data), media_type=mime)


@app.post("/api/jobs/{key}/result")
async def result(key: str, request: Request):
    job = authorize(request, key)
    async with job["lock"]:
        if job["sent"]:
            return {"ok": True, "already_sent": True}
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > MAX_BYTES:
                raise HTTPException(413, "PNG 超过 20 MB，请直接下载保存")
        await asyncio.to_thread(check_image, data, True)
        try:
            await api("sendDocument", {"chat_id": job["chat"], "caption": "四角透视拉正 · 原分辨率 PNG"}, {"document": ("cropped-hd.png", bytes(data), "image/png")})
        except Exception:
            raise HTTPException(502, "发送未确认，请先查看聊天；若未收到再重试")
        job["sent"] = True
        return {"ok": True}


app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[1]/"pages", html=True), name="pages")
