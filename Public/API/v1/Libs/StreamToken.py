# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import base64
import json

MAX_DECODED_SIZE = 8 * 1024
MAX_RAW_SIZE     = 16 * 1024


class StreamToken:
    @staticmethod
    def encode(url: str, referer: str = "", user_agent: str = "") -> str:
        payload = {
            "u": url,
            "r": referer or "",
            "a": user_agent or "",
        }
        raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")

    @staticmethod
    def decode(token):
        if not isinstance(token, str):
            return None
        if not token or len(token) > MAX_RAW_SIZE:
            return None

        padded = token + "=" * (-len(token) % 4)
        try:
            raw = base64.urlsafe_b64decode(padded.encode("ascii"))
        except Exception:
            return None

        if len(raw) > MAX_DECODED_SIZE:
            return None

        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            return None

        if not isinstance(data, dict):
            return None

        url = data.get("u")
        if not isinstance(url, str) or not url:
            return None

        referer = data.get("r") if isinstance(data.get("r"), str) else ""
        user_agent = data.get("a") if isinstance(data.get("a"), str) else ""

        return {"u": url, "r": referer, "a": user_agent}
