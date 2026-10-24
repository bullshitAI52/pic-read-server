# Telegram 四角裁剪 / Telegram perspective cropper

给机器人发图 → 点「调整四角」→ 用手指对准四个角 → 确认裁剪 → 点「发回 Telegram 高清图片」。返回 PNG 文件，不以聊天照片方式再次压缩。每个任务只能成功回传一次；想处理另一版，请重新给机器人发图。

这是独立的机器人网关，复用 `pages/` 的四角、放大镜、透视拉正功能。不改 main、旧 VPS 服务或桌面安装包。普通 GitHub Pages 页面照常本地处理；**GitHub Pages 不能运行机器人后端**。

## 上线前需要

1. 在 Telegram 的官方 @BotFather 创建一个专用机器人。Token 只保存在服务器环境文件，不能写进网页、仓库或截图。
2. 一个有效 HTTPS 域名，反向代理到本服务的 127.0.0.1:8770。`TG_PUBLIC_URL` 填独立域名根地址（不要带子路径）。不要使用原来的 HTTP 地址。
3. 用一个专用进程运行，不能多 worker，也不能同时运行其他使用这个机器人的轮询程序。已有 webhook 时本服务拒绝启动，不会擅自清除。

```sh
cd telegram
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# 使用服务器服务管理器或安全环境文件设置这些环境变量：
# TG_BOT_TOKEN：BotFather 提供的密钥
# TG_PUBLIC_URL：https://你的机器人专用域名
# TG_ALLOWED_USERS：可选，逗号分隔的 TG 数字用户 ID；建议先限制为自己
.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8770 --workers 1 --no-access-log
```

反向代理需允许至少 20 MB 请求体（例如 Nginx `client_max_body_size 21m;`）和 90 秒超时。建议限制请求频率、关闭带查询参数的访问日志。不要将 Token 配置在反向代理 URL 中。首次上线先用白名单测试，再决定是否开放。

## 使用和隐私

- 机器人只接受私聊，支持 JPEG/PNG/WebP。发送原图请选择「文件／不压缩」，普通照片可能已经被 Telegram 压缩，无法恢复丢失的细节。
- 输入和回传各最多 20 MB，最大 1600 万像素、单边 8192。过大的结果仍可本地下载。
- 图片经过 Telegram 和网关服务器；网关只在内存中中转，不写图片到磁盘。透视变换在手机浏览器完成。聊天中的图片不会自动删除。
- 任务元数据一小时过期，重启也失效。每人最多 10 个待过期任务，全局最多 500 个。没有长期图床功能。
- 服务端验证 Telegram 签名、登录时间和任务所属用户；不会相信网页传入的聊天 ID。
- 发送超时时可能实际已经送达，先看聊天再重试，避免重复。
- 仍需联网加载 OpenCV 和 Telegram SDK，不是离线小程序。

## 验证

`python -m unittest discover -s telegram -p 'test_*.py'`（在仓库根目录且已安装依赖的环境执行）。本地测试使用模拟 Telegram，不等于真实机器人上线验证。部署后必须在真实 TG 私聊验证发图、拖角、回传和不同用户隔离。

## English

Send an image to the bot → open **Adjust corners** → drag four handles → crop → send the full-resolution PNG back to your private chat. Each job sends one result; send the source again for another version.

This optional, standalone gateway reuses the existing browser cropper. It does not modify the original server, main branch or desktop installers. GitHub Pages alone cannot host the bot backend.

Create a dedicated BotFather bot, configure `TG_BOT_TOKEN` and an HTTPS root-domain `TG_PUBLIC_URL` privately on the server, optionally restrict `TG_ALLOWED_USERS` to comma-separated numeric IDs, install the dependencies above, and run one Uvicorn worker behind an HTTPS reverse proxy. Allow 21 MB request bodies and 90-second proxy timeouts. Existing webhooks are not removed automatically.

JPEG/PNG/WebP inputs and PNG results are limited to 20 MB, 16 megapixels and 8192 pixels per edge. Use Telegram's uncompressed/file option to preserve source quality. Images are relayed in memory, not stored on disk by the gateway; Telegram chat copies remain. Jobs expire after one hour or a restart. Signed Telegram init data and job ownership are checked server-side. Ordinary browser visits remain local-only. Network access is required for OpenCV and Telegram SDK loading.

Local tests mock Telegram; a real bot token, HTTPS deployment and real-device acceptance test are still required before claiming the integration is live.

Official references: [Mini Apps](https://core.telegram.org/bots/webapps), [Bot API](https://core.telegram.org/bots/api).
