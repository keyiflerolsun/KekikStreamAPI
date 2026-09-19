# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_SCHEMES = ("http", "https")

_BLOCKED_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
)

_RESERVED_SUFFIXES = (
    ".test",
    ".invalid",
    ".example",
    ".home.arpa",
)


class UrlGuard:
    @staticmethod
    async def validate(url) -> str | None:
        """Return an error string if the URL is disallowed, else None."""
        try:
            parsed = urlparse(url)
        except Exception:
            return "invalid_url"

        if parsed.scheme.lower() not in ALLOWED_SCHEMES:
            return "blocked_scheme"

        hostname = parsed.hostname
        if not hostname:
            return "invalid_host"

        return await UrlGuard._validate_host(hostname)

    @staticmethod
    async def _validate_host(hostname: str) -> str | None:
        lowered = hostname.lower().rstrip(".")

        if (
            lowered == "localhost"
            or lowered.endswith(_BLOCKED_SUFFIXES)
            or lowered.endswith(_RESERVED_SUFFIXES)
        ):
            return "blocked_host"

        try:
            ipaddress.ip_address(lowered)
        except ValueError:
            pass
        else:
            return "blocked_host"

        infos = await asyncio.to_thread(socket.getaddrinfo, lowered, None)

        for info in infos:
            ip_str = info[4][0]
            try:
                ip = ipaddress.ip_address(ip_str)
            except ValueError:
                return "blocked_host"

            if (
                ip.is_loopback
                or ip.is_private
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                return "blocked_host"

        return None

    @staticmethod
    async def validate_redirect(original: str, current: str) -> str | None:
        """Validate a redirect hop; the current target must itself be allowed."""
        try:
            curr_scheme = urlparse(current).scheme.lower()
        except Exception:
            return "invalid_url"

        if curr_scheme not in ALLOWED_SCHEMES:
            return "blocked_scheme"

        return await UrlGuard.validate(current)
