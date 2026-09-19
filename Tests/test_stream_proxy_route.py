# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import asyncio
import unittest

try:
    import httpx
    from Core import kekik_FastAPI
except ImportError:  # pragma: no cover - fastapi not available in plain venv
    httpx = None
    kekik_FastAPI = None


@unittest.skipIf(kekik_FastAPI is None, "fastapi/starlette not available in this interpreter")
class StreamProxyRouteTest(unittest.TestCase):
    def _run(self, coro):
        return asyncio.run(coro)

    def setUp(self):
        import Public.API.v1.Routers.stream_proxy as sp
        self._orig_proxy = sp._proxy
        sp._proxy = _FakeStreamProxy()

    def tearDown(self):
        import Public.API.v1.Routers.stream_proxy as sp
        sp._proxy = self._orig_proxy

    def _client(self):
        transport = httpx.ASGITransport(app=kekik_FastAPI)
        return httpx.AsyncClient(transport=transport, base_url="http://test")

    async def _do(self, path, headers=None):
        async with self._client() as c:
            return await c.get(path, headers=headers or {})

    def test_missing_token_400(self):
        r = self._run(self._do("/api/v1/stream-proxy"))
        self.assertEqual(r.status_code, 400)

    def test_bad_token_400_no_url_echo(self):
        r = self._run(self._do("/api/v1/stream-proxy?t=ZZZZ"))
        self.assertEqual(r.status_code, 400)
        self.assertNotIn("http", r.text)

    def test_success_streams_body_with_headers(self):
        r = self._run(self._do("/api/v1/stream-proxy?t=good"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.content, b"FAKE-BODY")

    def test_range_forwarded(self):
        _FakeStreamProxy.last_range = None
        self._run(self._do("/api/v1/stream-proxy?t=good", headers={"Range": "bytes=0-99"}))
        self.assertEqual(_FakeStreamProxy.last_range, "bytes=0-99")

    def test_blocked_host_403(self):
        r = self._run(self._do("/api/v1/stream-proxy?t=blocked"))
        self.assertEqual(r.status_code, 403)

    def test_upstream_error_502(self):
        r = self._run(self._do("/api/v1/stream-proxy?t=err"))
        self.assertEqual(r.status_code, 502)

    def test_timeout_504(self):
        r = self._run(self._do("/api/v1/stream-proxy?t=timeout"))
        self.assertEqual(r.status_code, 504)


class _FakeStreamProxy:
    last_range = None

    async def open(self, token, range_header=None):
        _FakeStreamProxy.last_range = range_header
        if token == "good":
            return _FakeResponse(200, {"content-type": "video/mp4"}, b"FAKE-BODY")
        if token == "blocked":
            return _FakeResponse(403, {"content-type": "application/json"}, b'{"hata": "blocked_host"}')
        if token == "err":
            return _FakeResponse(502, {"content-type": "application/json"}, b'{"hata": "upstream_error"}')
        if token == "timeout":
            return _FakeResponse(504, {"content-type": "application/json"}, b'{"hata": "ttfb_timeout"}')
        return _FakeResponse(400, {"content-type": "application/json"}, b'{"hata": "bad_token"}')


class _FakeResponse:
    def __init__(self, status_code, headers, body):
        self.status_code = status_code
        self.headers = headers
        self.body = self._body(body)

    async def _body(self, data: bytes):
        yield data


if __name__ == "__main__":
    unittest.main()
