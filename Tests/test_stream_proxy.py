# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import asyncio
import unittest

import httpx

from Public.API.v1.Libs.StreamProxy import StreamProxy
from Public.API.v1.Libs.StreamToken import StreamToken

PUBLIC_URL = "https://cdn.example.com/media/seg.ts"


def _run(coro):
    return asyncio.run(coro)


async def _collect(proxy_response):
    chunks = []
    async for chunk in proxy_response:
        chunks.append(chunk)
    return b"".join(chunks)


def _handler(request):
    return httpx.Response(200, content=b"SEGMENT-BYTES", headers={"Content-Type": "video/mp4"})


class StreamProxyTest(unittest.TestCase):
    def setUp(self):
        # Always resolve to a public host so UrlGuard passes.
        import Public.API.v1.Libs.UrlGuard as ug
        self._orig_getaddrinfo = ug.socket.getaddrinfo
        ug.socket.getaddrinfo = lambda host, port, *a, **k: [
            (ug.socket.AF_INET, ug.socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))
        ]

    def tearDown(self):
        import Public.API.v1.Libs.UrlGuard as ug
        ug.socket.getaddrinfo = self._orig_getaddrinfo

    def test_binary_passthrough(self):
        transport = httpx.MockTransport(_handler)
        proxy = StreamProxy(httpx.AsyncClient(transport=transport))
        token = StreamToken.encode(PUBLIC_URL, "https://site.com/", "UA")
        result = _run(proxy.open(token, "bytes=0-1023"))
        body = _run(_collect(result))
        self.assertEqual(body, b"SEGMENT-BYTES")
        self.assertEqual(result.status_code, 200)
        self.assertIn("content-type", result.headers)

    def test_range_forwarded_to_upstream(self):
        seen = {}

        def handler(request):
            seen["range"] = request.headers.get("range")
            return httpx.Response(200, content=b"DATA")

        proxy = StreamProxy(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        token = StreamToken.encode(PUBLIC_URL)
        _run(proxy.open(token, "bytes=100-199"))
        self.assertEqual(seen["range"], "bytes=100-199")

    def test_referer_user_agent_injected(self):
        seen = {}

        def handler(request):
            seen["referer"] = request.headers.get("referer")
            seen["ua"] = request.headers.get("user-agent")
            return httpx.Response(200, content=b"DATA")

        proxy = StreamProxy(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        token = StreamToken.encode(PUBLIC_URL, "https://site.com/", "TestUA")
        _run(proxy.open(token))
        self.assertEqual(seen["referer"], "https://site.com/")
        self.assertEqual(seen["ua"], "TestUA")

    def test_206_content_range_forwarded(self):
        def handler(request):
            return httpx.Response(
                206,
                content=b"PARTIAL",
                headers={"Content-Range": "bytes 0-9/100", "Content-Type": "application/octet-stream"},
            )

        proxy = StreamProxy(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        token = StreamToken.encode(PUBLIC_URL)
        result = _run(proxy.open(token, "bytes=0-9"))
        body = _run(_collect(result))
        self.assertEqual(result.status_code, 206)
        self.assertEqual(body, b"PARTIAL")
        self.assertEqual(result.headers.get("content-range"), "bytes 0-9/100")

    def test_manifest_rewritten_and_content_length_dropped(self):
        def handler(request):
            return httpx.Response(
                200,
                content=b"#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvariant.m3u8\n",
                headers={"Content-Type": "application/vnd.apple.mpegurl", "Content-Length": "60"},
            )

        proxy = StreamProxy(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        token = StreamToken.encode("https://cdn.example.com/master.m3u8")
        result = _run(proxy.open(token))
        body = _run(_collect(result)).decode("utf-8")
        self.assertIn("/api/v1/stream-proxy?t=", body)
        self.assertNotIn("content-length", result.headers)
        self.assertEqual(result.status_code, 200)

    def test_manifest_ignores_range(self):
        seen = {}

        def handler(request):
            seen["range"] = request.headers.get("range")
            return httpx.Response(
                200,
                content=b"#EXTM3U\nseg1.ts\n",
                headers={"Content-Type": "application/vnd.apple.mpegurl"},
            )

        proxy = StreamProxy(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        token = StreamToken.encode("https://cdn.example.com/master.m3u8")
        result = _run(proxy.open(token, "bytes=0-10"))
        self.assertEqual(result.status_code, 200)
        body = _run(_collect(result)).decode("utf-8")
        self.assertIn("/api/v1/stream-proxy?t=", body)
        self.assertIsNone(seen["range"])

    def test_invalid_token_maps_400(self):
        proxy = StreamProxy(httpx.AsyncClient(transport=httpx.MockTransport(_handler)))
        result = _run(proxy.open("not-a-token"))
        self.assertEqual(result.status_code, 400)

    def test_private_host_maps_403(self):
        import Public.API.v1.Libs.UrlGuard as ug
        proxy = StreamProxy(httpx.AsyncClient(transport=httpx.MockTransport(_handler)))
        token = StreamToken.encode("http://127.0.0.1/x")
        result = _run(proxy.open(token))
        self.assertEqual(result.status_code, 403)

    def test_upstream_5xx_maps_502(self):
        def handler(request):
            return httpx.Response(502, content=b"bad gateway")

        proxy = StreamProxy(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        token = StreamToken.encode(PUBLIC_URL)
        result = _run(proxy.open(token))
        self.assertEqual(result.status_code, 502)
        self.assertIn("content-type", result.headers)

    def test_redirect_validated_per_hop(self):
        def handler(request):
            if request.url.host == "cdn.example.com":
                return httpx.Response(302, headers={"Location": "http://127.0.0.1/evil"})
            return httpx.Response(200, content=b"DATA")

        proxy = StreamProxy(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        token = StreamToken.encode("https://cdn.example.com/start")
        result = _run(proxy.open(token))
        self.assertEqual(result.status_code, 403)

    def test_concurrency_semaphore_respected(self):
        active = 0
        peak = 0
        lock = asyncio.Lock()

        async def handler(request):
            nonlocal active, peak
            async with lock:
                active += 1
                peak = max(peak, active)
            await asyncio.sleep(0.05)
            async with lock:
                active -= 1
            return httpx.Response(200, content=b"DATA")

        async def run_many():
            transport = httpx.MockTransport(handler)
            proxy = StreamProxy(httpx.AsyncClient(transport=transport), max_concurrency=2)
            token = StreamToken.encode(PUBLIC_URL)
            results = await asyncio.gather(*(proxy.open(token) for _ in range(6)))
            for r in results:
                async for _ in r:
                    pass
            return peak

        peak = _run(run_many())
        self.assertLessEqual(peak, 2)


if __name__ == "__main__":
    unittest.main()
