# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import unittest

from Public.API.v1.Libs.HlsRewriter import HlsRewriter
from Public.API.v1.Libs.StreamToken import StreamToken

MANIFEST_URL = "https://cdn.example.com/path/playlist.m3u8"


def _enc(uri, r="https://site.com/", a="UA"):
    return StreamToken.encode(uri, r, a)


class HlsRewriterTest(unittest.TestCase):
    def test_is_manifest_content_type(self):
        self.assertTrue(HlsRewriter.is_manifest("application/vnd.apple.mpegurl"))
        self.assertTrue(HlsRewriter.is_manifest("application/x-mpegurl"))
        self.assertFalse(HlsRewriter.is_manifest("video/mp4"))

    def test_is_manifest_url(self):
        self.assertTrue(HlsRewriter.is_manifest(None, "https://x.com/live.m3u8"))
        self.assertFalse(HlsRewriter.is_manifest(None, "https://x.com/live.ts"))

    def test_master_variant_rewritten_absolute(self):
        text = (
            "#EXTM3U\n"
            "#EXT-X-STREAM-INF:BANDWIDTH=1280000\n"
            "chunklist_w1280.m3u8\n"
            "#EXT-X-STREAM-INF:BANDWIDTH=640000\n"
            "chunklist_w640.m3u8\n"
        )
        out = HlsRewriter.rewrite(text, MANIFEST_URL, _enc)
        lines = [l for l in out.split("\n") if l and not l.startswith("#")]
        self.assertEqual(len(lines), 2)
        for line in lines:
            self.assertTrue(line.startswith("/api/v1/stream-proxy?t="))
            decoded = StreamToken.decode(line.split("t=")[1])
            self.assertTrue(decoded["u"].startswith("https://cdn.example.com/path/"))

    def test_media_segments_and_byterange(self):
        text = (
            "#EXTM3U\n"
            "#EXT-X-TARGETDURATION:10\n"
            "#EXT-X-BYTERANGE:1000@0\n"
            "seg1.ts\n"
            "#EXT-X-BYTERANGE:1000@1000\n"
            "seg2.ts\n"
        )
        out = HlsRewriter.rewrite(text, MANIFEST_URL, _enc)
        lines = out.split("\n")
        self.assertIn("#EXT-X-BYTERANGE:1000@0", lines)
        segs = [l for l in lines if l and not l.startswith("#")]
        self.assertEqual(len(segs), 2)
        for seg in segs:
            self.assertTrue(seg.startswith("/api/v1/stream-proxy?t="))

    def test_encrypted_playlist_ext_x_key(self):
        text = (
            "#EXTM3U\n"
            '#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x00000001\n'
            "seg1.ts\n"
        )
        out = HlsRewriter.rewrite(text, MANIFEST_URL, _enc)
        self.assertIn('/api/v1/stream-proxy?t=', out)
        self.assertNotIn('URI="key.bin"', out)
        self.assertIn("#EXT-X-KEY:METHOD=AES-128", out)

    def test_fmp4_ext_x_map(self):
        text = (
            "#EXTM3U\n"
            '#EXT-X-MAP:URI="init.mp4"\n'
            "seg1.m4s\n"
        )
        out = HlsRewriter.rewrite(text, MANIFEST_URL, _enc)
        self.assertNotIn('URI="init.mp4"', out)
        self.assertIn("/api/v1/stream-proxy?t=", out)

    def test_session_key_rewritten(self):
        text = (
            "#EXTM3U\n"
            '#EXT-X-SESSION-KEY:METHOD=AES-128,URI="session.key"\n'
            "#EXT-X-STREAM-INF:BANDWIDTH=1\n"
            "variant.m3u8\n"
        )
        out = HlsRewriter.rewrite(text, MANIFEST_URL, _enc)
        self.assertNotIn('URI="session.key"', out)
        self.assertIn("#EXT-X-SESSION-KEY:METHOD=AES-128", out)
        self.assertIn("/api/v1/stream-proxy?t=", out)

    def test_comment_lines_unchanged(self):
        text = (
            "#EXTM3U\n"
            "#EXT-X-VERSION:3\n"
            "# This is a comment\n"
        )
        out = HlsRewriter.rewrite(text, MANIFEST_URL, _enc)
        self.assertEqual(out, text)

    def test_idempotence_noop_on_proxied(self):
        once = HlsRewriter.rewrite(
            "#EXTM3U\nseg1.ts\n", MANIFEST_URL, _enc
        )
        twice = HlsRewriter.rewrite(once, MANIFEST_URL, _enc)
        self.assertEqual(once, twice)


if __name__ == "__main__":
    unittest.main()
