import hashlib
import hmac
import io
import json
import time
import unittest
from urllib.parse import urlencode
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from PIL import Image
import server
from auth import user_id


def signed(uid=42, date=None):
    fields = {"auth_date": str(int(time.time()) if date is None else date), "user": json.dumps({"id": uid})}
    secret = hmac.new(b"WebAppData", b"test-token", hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, "\n".join(f"{k}={fields[k]}" for k in sorted(fields)).encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


class GatewayTests(unittest.TestCase):
    def setUp(self):
        server.TOKEN = "test-token"
        server.ALLOWED = set()
        server.jobs.clear()
        self.client = TestClient(server.app)  # No lifespan: never contact Telegram.

    def test_auth(self):
        self.assertEqual(user_id(signed(), "test-token"), 42)
        for raw in [signed()+"&auth_date=0", signed(date=1), signed().replace("42", "43"), ""]:
            with self.assertRaises((ValueError, KeyError)):
                user_id(raw, "test-token")

    def test_missing_auth_and_job(self):
        self.assertEqual(self.client.get("/api/jobs/no/image").status_code, 401)
        self.assertEqual(self.client.get("/api/jobs/no/image", headers={"X-Telegram-Init-Data": signed()}).status_code, 404)

    def test_send_and_owner_and_duplicate(self):
        import asyncio
        server.jobs["test"] = {"uid":42,"chat":42,"file":"file-id","expires":time.time()+100,"sent":False,"lock":asyncio.Lock()}
        buf=io.BytesIO(); Image.new("RGB",(100,100)).save(buf, "PNG")
        headers={"X-Telegram-Init-Data": signed()}
        with patch.object(server, "api", new_callable=AsyncMock) as api:
            self.assertEqual(self.client.post("/api/jobs/test/result",headers={"X-Telegram-Init-Data":signed(43)},content=buf.getvalue()).status_code,404)
            self.assertEqual(self.client.post("/api/jobs/test/result",headers=headers,content=b"not an image").status_code,400)
            for _ in range(2):
                self.assertEqual(self.client.post("/api/jobs/test/result",headers=headers,content=buf.getvalue()).status_code,200)
            self.assertEqual(api.await_count,1)
            self.assertEqual(api.call_args.args[0],"sendDocument")

    def test_image_limits(self):
        buf=io.BytesIO(); Image.new("RGB",(20,20)).save(buf,"PNG")
        with self.assertRaises(server.HTTPException): server.check_image(buf.getvalue())

    def test_incoming_photo_creates_button(self):
        import asyncio
        server.BASE = "https://example.org"
        with patch.object(server, "api", new_callable=AsyncMock) as api:
            asyncio.run(server.message({"chat":{"type":"private","id":42},"from":{"id":42},"photo":[{"file_id":"photo","file_size":100}]}))
            self.assertEqual(len(server.jobs),1)
            markup=json.loads(api.call_args.args[1]["reply_markup"])
            self.assertTrue(markup["inline_keyboard"][0][0]["web_app"]["url"].startswith("https://example.org/?tg_job="))

    def test_expired_job(self):
        server.jobs["old"]={"uid":42,"expires":0}
        response=self.client.get("/api/jobs/old/image", headers={"X-Telegram-Init-Data":signed()})
        self.assertEqual(response.status_code,404)

    def test_static_page(self):
        response=self.client.get("/")
        self.assertEqual(response.status_code,200)
        self.assertIn("telegram.js", response.text)
        self.assertEqual(response.headers["referrer-policy"],"no-referrer")


if __name__ == "__main__": unittest.main()
