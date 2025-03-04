from fastapi import Request, Response
from fastapi.responses import StreamingResponse
from . import home_router
from urllib.parse import unquote
import httpx
import asyncio
import json

# Sabit değerler
DEFAULT_USER_AGENT    = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5)"
DEFAULT_REFERER       = "https://twitter.com/"
DEFAULT_CHUNK_SIZE    = 1024 * 64  # 64KB
HLS_BUFFER_MULTIPLIER = 2
TS_BUFFER_MULTIPLIER  = 4

# Content-Type helpers
CONTENT_TYPES = {
    ".m3u8"   : "application/vnd.apple.mpegurl",
    ".ts"     : "video/mp2t",
    "default" : "video/mp4",
}

# Önemli HTTP başlıkları
IMPORTANT_HEADERS = [
    "Content-Length",
    "Content-Range",
    "Content-Type",
    "Accept-Ranges",
    "ETag",
    "Cache-Control",
    "X-Content-Duration",
    "Content-Duration",
    "Content-Disposition",
]

# CORS ayarları
CORS_HEADERS = {
    "Access-Control-Allow-Origin"  : "*",
    "Access-Control-Allow-Methods" : "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers" : "Origin, Content-Type, Accept, Range",
}

# HLS özel başlıkları
HLS_HEADERS = {
    "Cache-Control" : "no-cache, no-store, must-revalidate",
    "Pragma"        : "no-cache",
    "Expires"       : "0",
}


async def get_client_headers(request: Request, referer: str, headers: dict):
    """İstemci başlıklarını hazırla"""
    # User-Agent belirleme
    user_agent = headers.get("User-Agent", DEFAULT_USER_AGENT)

    # Temel başlıklar
    headers = {
        "User-Agent"      : user_agent,
        "Accept"          : "*/*",
        "Accept-Encoding" : "identity",
        "Connection"      : "keep-alive",
        "Cache-Control"   : "no-cache",
    }

    # Range header varsa ekle
    if "Range" in request.headers:
        headers["Range"] = request.headers["Range"]

    # Referer bilgisi ekle
    if referer and referer != "None":
        headers["Referer"] = unquote(referer)
    else:
        headers["Referer"] = DEFAULT_REFERER

    return headers


def get_response_headers(response_headers: dict[str, str], url: str):
    """Yanıt başlıklarını hazırla"""
    resp_headers = {}

    # Önemli başlıkları kopyala
    for header in IMPORTANT_HEADERS:
        if header.lower() in response_headers:
            resp_headers[header] = response_headers[header.lower()]

    # Content-Type kontrolü
    if "Content-Type" not in resp_headers:
        # URL'e göre uygun Content-Type belirleme
        for ext, content_type in CONTENT_TYPES.items():
            if ext in url:
                resp_headers["Content-Type"] = content_type
                break
        else:
            resp_headers["Content-Type"] = CONTENT_TYPES["default"]

    # CORS başlıklarını ekle
    resp_headers.update(CORS_HEADERS)

    # HLS için özel handling
    content_type = resp_headers.get("Content-Type", "").lower()
    if "mpegurl" in content_type or content_type == "application/vnd.apple.mpegurl":
        resp_headers.update(HLS_HEADERS)

    # Accept-Ranges header'ı yoksa ekle
    if "Accept-Ranges" not in resp_headers:
        resp_headers["Accept-Ranges"] = "bytes"

    return resp_headers


async def stream_video_content(response, url: str, content_type: str):
    """Video içeriğini akışlı olarak gönder"""
    try:
        buffer     = b""
        chunk_size = DEFAULT_CHUNK_SIZE

        async for chunk in response.aiter_bytes(chunk_size=chunk_size):
            # HLS segment'leri için buffer kullan
            if "mpegurl" in content_type.lower() or "mp2t" in content_type.lower():
                buffer += chunk
                # Buffer belirli bir boyuta ulaştığında gönder
                buffer_threshold = (
                    chunk_size * TS_BUFFER_MULTIPLIER
                    if url.endswith(".ts")
                    else chunk_size * HLS_BUFFER_MULTIPLIER
                )
                if len(buffer) >= buffer_threshold:
                    yield buffer
                    buffer = b""
            else:
                # Normal video için direkt gönder
                yield chunk

            await asyncio.sleep(0)  # Event loop'a nefes aldır

        # Kalan buffer'ı gönder
        if buffer:
            yield buffer
    except Exception as stream_error:
        print(f"Stream hatası: {str(stream_error)}")
        # Sadece loglama yap, stream'i kesme


@home_router.get("/proxy/video")
async def video_proxy(request: Request, url: str, referer: str = None, headers: str = None):
    """Video proxy endpoint'i"""
    try:
        # URL'i decode et
        decoded_url = unquote(url)

        # İstemci başlıklarını decode et
        decoded_headers = json.loads(headers) if headers else {}

        # İstemci başlıklarını hazırla
        headers = await get_client_headers(request, referer, decoded_headers)

        print(f"Proxy isteği: {decoded_url} - Headers: {headers}")

        # Stream yanıtı için generator
        async def stream_generator():
            # HTTPX istemcisi oluştur
            async with httpx.AsyncClient(
                follow_redirects = True,
                timeout          = 60.0,
                transport        = httpx.AsyncHTTPTransport(retries=3),
            ) as client:
                async with client.stream("GET", decoded_url, headers=headers) as response:
                    if response.status_code >= 400:
                        print(f"Hata: Video kaynağı {response.status_code} hatası döndürdü")
                        return

                    # Yanıt başlıklarını hazırla
                    resp_headers = get_response_headers(response.headers, decoded_url)

                    # İlk yanıt başlıklarını gönder
                    yield {"status_code": response.status_code, "headers": resp_headers}

                    # İçerik akışını başlat
                    content_type = resp_headers.get("Content-Type", "")
                    async for chunk in stream_video_content(response, decoded_url, content_type):
                        yield chunk

        # Stream yanıtını hazırla ve ilk yanıttan status_code ve headers al
        generator    = stream_generator()
        first_yield  = await generator.__anext__()
        status_code  = first_yield["status_code"]
        resp_headers = first_yield["headers"]

        print(f"Proxy yanıtı: Status: {status_code}, Headers: {resp_headers}")

        # Özel StreamingResponse sınıfı oluştur
        async def modified_generator():
            try:
                async for chunk in generator:
                    if isinstance(chunk, dict):  # İlk yield edilen headers'ı atla
                        continue
                    yield chunk
            except StopAsyncIteration:
                pass

        # Stream yanıtı döndür
        return StreamingResponse(
            modified_generator(),
            status_code = status_code,
            headers     = resp_headers,
            media_type  = resp_headers.get("Content-Type", "video/mp4"),
        )

    except Exception as e:
        print(f"Video proxy hatası: {str(e)}")
        return Response(
            content     = f"Video proxy hatası: {str(e)}",
            status_code = 500,
            media_type  = "text/plain",
        )


@home_router.get("/proxy/subtitle")
async def subtitle_proxy(request: Request, url: str, referer: str = None, headers: str = None):
    """Altyazı proxy endpoint'i"""
    try:
        # URL'i decode et
        decoded_url = unquote(url)

        # İstemci başlıklarını decode et
        decoded_headers = json.loads(headers) if headers else {}

        # İstemciden gelen User-Agent bilgisini al
        user_agent = decoded_headers.get("User-Agent", DEFAULT_USER_AGENT)

        # Hedef sunucuya gönderilecek başlıkları ayarla
        headers = {
            "User-Agent"      : user_agent,
            "Accept"          : "*/*",
            "Accept-Encoding" : "identity",
            "Connection"      : "keep-alive",
        }

        # Referer bilgisi varsa ekle
        if referer:
            headers["Referer"] = unquote(referer)

        # Altyazı içeriğini al ve işle
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            response = await client.get(decoded_url, headers=headers)

            if response.status_code >= 400:
                return Response(
                    content     = f"Altyazı kaynağı {response.status_code} hatası döndürdü",
                    status_code = response.status_code,
                    media_type  = "text/plain",
                )

            content      = response.content
            content_type = response.headers.get("Content-Type", "")

            # VTT formatını düzeltme (gerekirse)
            if "text/vtt" in content_type or content.startswith(b"WEBVTT"):
                if not content.startswith(b"WEBVTT"):
                    content = b"WEBVTT\n\n" + content

        # CORS başlıklarını içeren yanıt başlıkları
        resp_headers = {
            "Content-Type"                 : "text/vtt; charset=utf-8",
            "Access-Control-Allow-Origin"  : "*",
            "Access-Control-Allow-Methods" : "GET, OPTIONS",
            "Access-Control-Allow-Headers" : "Origin, Content-Type, Accept",
        }

        # Altyazı içeriğini döndür
        return Response(
            content     = content,
            status_code = 200,
            headers     = resp_headers,
            media_type  = "text/vtt",
        )

    except Exception as e:
        print(f"Altyazı proxy hatası: {str(e)}")
        return Response(
            content     = f"Altyazı proxy hatası: {str(e)}",
            status_code = 500,
            media_type  = "text/plain",
        )
