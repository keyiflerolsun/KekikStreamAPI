# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import logging
import unittest

try:
    from Core.Modules._access_log import StreamProxyErisimLoguGizle, erisim_logu_gizle
except ImportError:  # pragma: no cover - fastapi not available in plain venv
    StreamProxyErisimLoguGizle = None
    erisim_logu_gizle = None


@unittest.skipIf(StreamProxyErisimLoguGizle is None, "fastapi/starlette not available in this interpreter")
class StreamProxyAccessLogFilterTest(unittest.TestCase):
    def _record(self, msg):
        return logging.LogRecord(
            name="uvicorn.access", level=logging.INFO, pathname=__file__,
            lineno=1, msg=msg, args=(), exc_info=None,
        )

    def test_stream_proxy_request_line_filtered(self):
        filt = StreamProxyErisimLoguGizle()
        self.assertFalse(filt.filter(self._record('127.0.0.1 - "GET /api/v1/stream-proxy?t=abc HTTP/1.1" 200')))

    def test_other_routes_not_filtered(self):
        filt = StreamProxyErisimLoguGizle()
        self.assertTrue(filt.filter(self._record('127.0.0.1 - "GET /api/v1/search?plugin=X&query=y HTTP/1.1" 200')))
        self.assertTrue(filt.filter(self._record('127.0.0.1 - "GET /api/v1/health HTTP/1.1" 200')))

    def test_erisim_logu_gizle_idempotent(self):
        erisim = logging.getLogger("uvicorn.access")
        erisim_logu_gizle()
        erisim_logu_gizle()
        self.assertEqual(
            sum(1 for f in erisim.filters if isinstance(f, StreamProxyErisimLoguGizle)),
            1,
        )


if __name__ == "__main__":
    unittest.main()
