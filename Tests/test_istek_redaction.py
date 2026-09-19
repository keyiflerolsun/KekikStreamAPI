# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import asyncio
import unittest

try:
    import httpx
    from Core import kekik_FastAPI
except ImportError:  # pragma: no cover - fastapi not available in plain venv
    httpx = None
    kekik_FastAPI = None


def _run(coro):
    return asyncio.run(coro)


@unittest.skipIf(kekik_FastAPI is None, "fastapi/starlette not available in this interpreter")
class IstekLogRedactionTest(unittest.TestCase):
    def setUp(self):
        import Core.Modules._istek as istek
        self._orig_log_salla = istek.log_salla
        self._logged = []
        istek.log_salla = self._capture

    def tearDown(self):
        import Core.Modules._istek as istek
        istek.log_salla = self._orig_log_salla

    async def _capture(self, log_veri, request):
        self._logged.append(log_veri)

    def _client(self):
        transport = httpx.ASGITransport(app=kekik_FastAPI)
        return httpx.AsyncClient(transport=transport, base_url="http://test")

    async def _get(self, path):
        async with self._client() as c:
            return await c.get(path)

    def test_load_links_veri_redacted(self):
        _run(self._get("/api/v1/load_links?plugin=CanliTV&encoded_url=SECRET_STREAM_TOKEN"))
        self.assertTrue(self._logged, "load_links isteği loglanmış olmalı (sadece yol)")
        log_veri = self._logged[-1]
        self.assertEqual(log_veri["url"], "http://test/api/v1/load_links")
        self.assertIsNone(log_veri["veri"])

    def test_stream_proxy_not_logged(self):
        _run(self._get("/api/v1/stream-proxy?t=SECRET_STREAM_TOKEN"))
        self.assertEqual(self._logged, [], "stream-proxy hiç loglanmamalı")

    def test_search_veri_kept(self):
        _run(self._get("/api/v1/search?plugin=CanliTV&query=Meclis"))
        log_veri = self._logged[-1]
        self.assertEqual(log_veri["url"], "http://test/api/v1/search")
        self.assertIsNotNone(log_veri["veri"])
        self.assertIn("query", log_veri["veri"])


if __name__ == "__main__":
    unittest.main()
