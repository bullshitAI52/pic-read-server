"""Telegram Mini App authentication; never trust client-provided chat IDs."""
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


def user_id(raw, token, now=None):
    pairs = parse_qsl(raw, strict_parsing=True)
    data = dict(pairs)
    if len(data) != len(pairs):
        raise ValueError("Duplicate fields")
    signature = data.pop("hash", "")
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    check = "\n".join(f"{key}={data[key]}" for key in sorted(data))
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise ValueError("Invalid signature")
    age = (time.time() if now is None else now) - int(data["auth_date"])
    if not -30 <= age <= 3600:
        raise ValueError("Expired session")
    uid = json.loads(data["user"])["id"]
    if type(uid) is not int or uid <= 0:
        raise ValueError("Invalid user")
    return uid
