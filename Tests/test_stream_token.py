# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import unittest

from Public.API.v1.Libs.StreamToken import StreamToken


class StreamTokenTest(unittest.TestCase):
    def test_round_trip(self):
        token = StreamToken.encode("https://example.com/a b.m3u8", "https://site.com/", "UA/1.0")
        payload = StreamToken.decode(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["u"], "https://example.com/a b.m3u8")
        self.assertEqual(payload["r"], "https://site.com/")
        self.assertEqual(payload["a"], "UA/1.0")

    def test_non_ascii_url(self):
        url = "https://example.com/çok/üye.m3u8"
        token = StreamToken.encode(url)
        self.assertEqual(StreamToken.decode(token)["u"], url)

    def test_no_padding(self):
        token = StreamToken.encode("https://example.com/x")
        self.assertNotIn("=", token)
        self.assertEqual(StreamToken.decode(token)["u"], "https://example.com/x")

    def test_malformed_base64(self):
        self.assertIsNone(StreamToken.decode("!!!!not-base64!!!!"))

    def test_oversized_payload_rejected(self):
        url = "https://example.com/" + "a" * 9000
        token = StreamToken.encode(url)
        self.assertIsNone(StreamToken.decode(token))

    def test_raw_length_guard(self):
        token = "A" * 20000
        self.assertIsNone(StreamToken.decode(token))

    def test_missing_url_rejected(self):
        import base64
        import json
        raw = json.dumps({"r": "x"}).encode("utf-8")
        token = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
        self.assertIsNone(StreamToken.decode(token))

    def test_empty_token(self):
        self.assertIsNone(StreamToken.decode(""))
        self.assertIsNone(StreamToken.decode(None))


if __name__ == "__main__":
    unittest.main()
