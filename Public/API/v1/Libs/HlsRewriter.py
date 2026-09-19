# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import re
from urllib.parse import urljoin, urlparse

MANIFEST_CONTENT_TYPES = (
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "audio/mpegurl",
    "audio/x-mpegurl",
)

_PROXY_PREFIX = "/api/v1/stream-proxy"

_URI_TAG_PATTERNS = (
    re.compile(r'(#EXT-X-KEY:[^\n]*URI=")([^"]*)(")'),
    re.compile(r'(#EXT-X-SESSION-KEY:[^\n]*URI=")([^"]*)(")'),
    re.compile(r'(#EXT-X-MAP:[^\n]*URI=")([^"]*)(")'),
    re.compile(r'(#EXT-X-MEDIA:[^\n]*URI=")([^"]*)(")'),
    re.compile(r'(#EXT-X-I-FRAME-STREAM-INF:[^\n]*URI=")([^"]*)(")'),
)


class HlsRewriter:
    @staticmethod
    def is_manifest(content_type: str | None, url: str = "") -> bool:
        if content_type:
            ctype = content_type.split(";")[0].strip().lower()
            if ctype in MANIFEST_CONTENT_TYPES:
                return True
        if url:
            path = urlparse(url).path
            if path.endswith(".m3u8"):
                return True
        return False

    @staticmethod
    def _rewrite_uri(uri: str, manifest_url: str, token_encoder) -> str:
        if uri == "" or uri.startswith("#"):
            return uri

        if uri.startswith("data:"):
            return uri

        absolute = urljoin(manifest_url, uri)
        parsed = urlparse(absolute)
        if parsed.scheme not in ("http", "https"):
            return uri

        if parsed.path.startswith(_PROXY_PREFIX):
            return uri

        return f"{_PROXY_PREFIX}?t={token_encoder(absolute)}"

    @staticmethod
    def rewrite(text: str, manifest_url: str, token_encoder) -> str:
        lines = text.split("\n")

        out_lines = []
        for line in lines:
            trailing = ""
            stripped = line.rstrip("\r")
            if stripped != line:
                trailing = line[len(stripped):]

            if stripped.startswith("#"):
                rewritten = stripped
                for pattern in _URI_TAG_PATTERNS:
                    rewritten = pattern.sub(
                        lambda m, p=pattern: m.group(1)
                        + HlsRewriter._rewrite_uri(m.group(2), manifest_url, token_encoder)
                        + m.group(3),
                        rewritten,
                    )
                out_lines.append(rewritten + trailing)
                continue

            if not stripped.strip():
                out_lines.append(line)
                continue

            out_lines.append(HlsRewriter._rewrite_uri(stripped, manifest_url, token_encoder) + trailing)

        return "\n".join(out_lines)
