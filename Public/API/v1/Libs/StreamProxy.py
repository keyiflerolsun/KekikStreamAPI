# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import asyncio
import json
import os
from urllib.parse import urljoin

import httpx

from .HlsRewriter import HlsRewriter
from .StreamToken import StreamToken
from .UrlGuard import UrlGuard

MAX_REDIRECTS = 3

_FORWARD_RESPONSE_HEADERS = (
    "content-type",
    "content-length",
    "content-range",
    "content-encoding",
    "accept-ranges",
    "cache-control",
    "expires",
    "etag",
    "last-modified",
)

_MAX_CONCURRENCY = int(os.getenv("KEKIKSTREAM_STREAM_PROXY_MAX_CONCURRENCY", "32"))


class ProxyResponse:
    def __init__(self, status_code, headers, body):
        self.status_code = status_code
        self.headers = headers
        self.body = body

    async def __aiter__(self):
        async for chunk in self.body:
            yield chunk


class StreamProxy:
    def __init__(self, client: httpx.AsyncClient | None = None, max_concurrency: int | None = None):
        self.client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10, read=30, write=10, pool=5),
            follow_redirects=False,
        )
        self._semaphore = asyncio.Semaphore(max_concurrency or _MAX_CONCURRENCY)

    async def open(self, token: str, range_header: str | None = None):
        payload = StreamToken.decode(token)
        if payload is None:
            return ProxyResponse(400, {"content-type": "application/json"}, _json_body("bad_token"))

        url = payload["u"]
        referer = payload["r"]
        user_agent = payload["a"]

        error = await UrlGuard.validate(url)
        if error:
            return ProxyResponse(403, {"content-type": "application/json"}, _json_body(error))

        # Manifests must never be fetched with a Range header: a CDN answering
        # 206 for an `.m3u8` would have its partial body rewritten and served
        # as a complete 200 manifest (silent corruption). Classify by URL
        # before any request is built and drop the Range for `.m3u8` URLs.
        if HlsRewriter.is_manifest(None, url):
            range_header = None

        async with self._semaphore:
            return await self._fetch(url, referer, user_agent, range_header)

    async def _fetch(self, url, referer, user_agent, range_header):
        current_url = url
        headers = {
            "Accept-Encoding": "identity",
        }
        if referer:
            headers["Referer"] = referer
        if user_agent:
            headers["User-Agent"] = user_agent
        if range_header:
            headers["Range"] = range_header

        for _ in range(MAX_REDIRECTS + 1):
            try:
                request = self.client.build_request("GET", current_url, headers=headers)
                response = await self.client.send(request, stream=True)
            except httpx.TimeoutException:
                return ProxyResponse(504, {"content-type": "application/json"}, _json_body("ttfb_timeout"))
            except httpx.RequestError:
                return ProxyResponse(502, {"content-type": "application/json"}, _json_body("upstream_error"))

            if response.is_redirect:
                location = response.headers.get("location")
                await response.aclose()
                if not location:
                    return ProxyResponse(502, {"content-type": "application/json"}, _json_body("bad_redirect"))

                next_url = urljoin(current_url, location)
                error = await UrlGuard.validate_redirect(current_url, next_url)
                if error:
                    return ProxyResponse(403, {"content-type": "application/json"}, _json_body(error))

                current_url = next_url
                continue

            if response.status_code >= 500:
                await response.aclose()
                return ProxyResponse(502, {"content-type": "application/json"}, _json_body("upstream_error"))

            return await self._stream(response, current_url, referer, user_agent)

        return ProxyResponse(502, {"content-type": "application/json"}, _json_body("too_many_redirects"))

    async def _stream(self, response, current_url, referer, user_agent):
        content_type = response.headers.get("content-type")

        if HlsRewriter.is_manifest(content_type, current_url):
            body = await response.aread()
            await response.aclose()
            text = body.decode("utf-8", errors="replace")
            rewritten = HlsRewriter.rewrite(
                text,
                current_url,
                lambda uri, r=referer, a=user_agent: StreamToken.encode(uri, r, a),
            )
            headers = {"content-type": content_type or "application/vnd.apple.mpegurl"}
            return ProxyResponse(200, headers, _bytes_body(rewritten.encode("utf-8")))

        headers = {}
        for name in _FORWARD_RESPONSE_HEADERS:
            value = response.headers.get(name)
            if value is not None:
                headers[name] = value

        return ProxyResponse(response.status_code, headers, _raw_body(response))


def json_body(reason: str) -> bytes:
    return json.dumps({"hata": reason}).encode("utf-8")


def _json_body(reason: str):
    return _bytes_body(json_body(reason))


async def _bytes_body(data: bytes):
    yield data


async def _raw_body(response):
    try:
        # Iterate the raw byte stream directly. For real streaming transports
        # this is the raw (undecoded) body; for in-memory transports (e.g.
        # httpx.MockTransport built with `content=`) the body has already been
        # read and closed at construction, so `aiter_raw()` would raise
        # `StreamConsumed` — iterating `response.stream` still yields the raw
        # bytes once in that case.
        async for chunk in response.stream:
            yield chunk
    finally:
        await response.aclose()
