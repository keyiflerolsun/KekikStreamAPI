# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import asyncio
import socket
import unittest

from Public.API.v1.Libs.UrlGuard import UrlGuard


def _run(coro):
    return asyncio.run(coro)


class UrlGuardTest(unittest.TestCase):
    def setUp(self):
        self._orig_getaddrinfo = socket.getaddrinfo
        socket.getaddrinfo = self._fake_getaddrinfo

    def tearDown(self):
        socket.getaddrinfo = self._orig_getaddrinfo

    @staticmethod
    def _fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]

    def test_loopback_ipv4(self):
        self.assertEqual(_run(UrlGuard.validate("http://127.0.0.1/x")), "blocked_host")

    def test_loopback_ipv6(self):
        self.assertEqual(_run(UrlGuard.validate("http://[::1]/x")), "blocked_host")

    def test_private_10(self):
        self.assertEqual(_run(UrlGuard.validate("http://10.0.0.1/x")), "blocked_host")

    def test_link_local(self):
        self.assertEqual(_run(UrlGuard.validate("http://169.254.169.254/x")), "blocked_host")

    def test_private_192(self):
        self.assertEqual(_run(UrlGuard.validate("http://192.168.1.1/x")), "blocked_host")

    def test_localhost_hostname(self):
        self.assertEqual(_run(UrlGuard.validate("http://localhost/x")), "blocked_host")

    def test_internal_hostname(self):
        self.assertEqual(_run(UrlGuard.validate("http://metadata.google.internal/x")), "blocked_host")

    def test_local_suffix(self):
        self.assertEqual(_run(UrlGuard.validate("http://nas.local/x")), "blocked_host")

    def test_file_scheme(self):
        self.assertEqual(_run(UrlGuard.validate("file:///etc/passwd")), "blocked_scheme")

    def test_ftp_scheme(self):
        self.assertEqual(_run(UrlGuard.validate("ftp://example.com/x")), "blocked_scheme")

    def test_public_host_allowed(self):
        self.assertIsNone(_run(UrlGuard.validate("https://example.com/x")))

    def test_redirect_blocked(self):
        self.assertEqual(
            _run(UrlGuard.validate_redirect("https://example.com/x", "http://127.0.0.1/x")),
            "blocked_host",
        )

    def test_redirect_allowed(self):
        self.assertIsNone(
            _run(UrlGuard.validate_redirect("https://example.com/x", "https://cdn.example.com/y"))
        )


if __name__ == "__main__":
    unittest.main()
