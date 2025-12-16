# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI import konsol
import asyncio
import subprocess
import json

async def ytdlp_extract_video_info(url: str):
    """
    yt-dlp ile video bilgisi çıkar

    Returns:
        {
            "title": str,
            "stream_url": str,
            "duration": float,
            "thumbnail": str,
            "format": str  # "hls" | "mp4" | "webm"
        }
    """
    try:
        # yt-dlp komutunu async olarak çalıştır
        cmd = [
            "yt-dlp",
            "--no-warnings",
            "--no-playlist",
            "-j",  # JSON output
            "-f", "best",
            "--format-sort", "proto:https",  # HTTPS (progressive) öncelikli, HLS yerine
            url
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=30.0  # 30 saniye timeout
        )

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            konsol.log(f"[red]yt-dlp error:[/] {error_msg}")
            return None

        # JSON parse
        info = json.loads(stdout.decode())

        # Format belirleme
        ext = info.get("ext", "mp4")
        if "m3u8" in info.get("url", "") or info.get("protocol") == "m3u8_native":
            video_format = "hls"
        elif ext in ["mp4", "webm"]:
            video_format = ext
        else:
            video_format = "mp4"

        return {
            "title"        : info.get("title", "Video"),
            "stream_url"   : info.get("url"),
            "duration"     : info.get("duration", 0),
            "thumbnail"    : info.get("thumbnail"),
            "format"       : video_format,
            "uploader"     : info.get("uploader", ""),
            "description"  : info.get("description", "")[:200] if info.get("description") else "",
            "http_headers" : info.get("http_headers", {})
        }

    except asyncio.TimeoutError:
        konsol.log(f"[red]yt-dlp timeout:[/] {url}")
        return None
    except json.JSONDecodeError as e:
        konsol.log(f"[red]yt-dlp JSON parse error:[/] {e}")
        return None
    except FileNotFoundError:
        konsol.log("[red]yt-dlp not found![/] Please install: pip install yt-dlp")
        return None
    except Exception as e:
        konsol.log(f"[red]yt-dlp exception:[/] {e}")
        return None
