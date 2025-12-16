# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI          import konsol
from fastapi      import Request
from urllib.parse import unquote
import httpx, traceback

DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5)"
DEFAULT_REFERER    = "https://twitter.com/"
DEFAULT_CHUNK_SIZE = 1024 * 128  # 128KB

CONTENT_TYPES = {
    ".m3u8" : "application/vnd.apple.mpegurl",
    ".ts"   : "video/mp2t",
    ".mp4"  : "video/mp4",
    ".webm" : "video/webm",
    ".mkv"  : "video/x-matroska",
}

CORS_HEADERS = {
    "Access-Control-Allow-Origin"  : "*",
    "Access-Control-Allow-Methods" : "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers" : "Origin, Content-Type, Accept, Range",
}

def get_content_type(url: str, response_headers: dict) -> str:
    """URL ve response headers'dan content-type belirle"""
    # 1. Response header kontrolü
    if ct := response_headers.get("content-type"):
        return ct
    
    # 2. URL uzantısı kontrolü
    url_lower = url.lower()
    for ext, ct in CONTENT_TYPES.items():
        if ext in url_lower:
            return ct
            
    # 3. Varsayılan
    return "video/mp4"

def prepare_request_headers(request: Request, url: str, referer: str | None, user_agent: str | None) -> dict:
    """Proxy isteği için headerları hazırlar"""
    headers = {
        "Accept"          : "*/*",
        "Accept-Encoding" : "identity",
        "Connection"      : "keep-alive",
    }
    
    # User-Agent ayarı
    if user_agent and user_agent != "None":
        headers["User-Agent"] = user_agent
    else:
        headers["User-Agent"] = DEFAULT_USER_AGENT
        
    # Referer ayarı
    if referer and referer != "None":
        headers["Referer"] = unquote(referer)

    return headers

def prepare_response_headers(response_headers: dict, url: str, detected_content_type: str = None) -> dict:
    """Client'a dönecek headerları hazırlar"""
    headers = CORS_HEADERS.copy()
    
    # Content-Type belirle
    headers["Content-Type"] = detected_content_type or get_content_type(url, response_headers)
    
    # Transfer edilecek headerlar
    important_headers = [
        "content-range", "accept-ranges",
        "etag", "cache-control", "content-disposition",
        "content-length"
    ]
    
    for header in important_headers:
        if val := response_headers.get(header):
            headers[header.title()] = val
            
    # Zorunlu headerlar
    if "Accept-Ranges" not in headers:
        headers["Accept-Ranges"] = "bytes"
        
    return headers

def detect_hls_from_url(url: str) -> bool:
    """URL yapısından HLS olup olmadığını tahmin eder"""
    indicators = (".m3u8", "/m.php", "/l.php", "/ld.php", "master.txt", "embed/sheila")
    return any(x in url for x in indicators)

async def stream_wrapper(response: httpx.Response):
    """Response içeriğini yield eder ve HLS kontrolü yapar"""
    try:
        original_ct  = response.headers.get('content-type', 'bilinmiyor')
        first_chunk  = None
        corrected_ct = None
        
        async for chunk in response.aiter_bytes(chunk_size=DEFAULT_CHUNK_SIZE):
            if first_chunk is None:
                first_chunk = chunk
                # HLS Manifest kontrolü
                try:
                    preview = chunk[:100].decode('utf-8', errors='ignore')
                    if preview.strip().startswith('#EXTM3U'):
                        corrected_ct = 'application/vnd.apple.mpegurl'
                except:
                    pass
                
                # HTML uyarısı
                if 'text/html' in original_ct.lower() and not corrected_ct:
                    konsol.print(f"[red]⚠️  UYARI: Kaynak HTML döndürüyor![/red]")
            
            yield chunk
            
    except GeneratorExit:
        pass
    except Exception as e:
        konsol.print(f"[red]Stream hatası: {str(e)}[/red]")
        konsol.print(traceback.format_exc())
    except BaseException:
        pass
    finally:
        await response.aclose()

def process_subtitle_content(content: bytes, content_type: str, url: str) -> bytes:
    """Altyazı içeriğini işler ve VTT formatına çevirir"""
    # 1. UTF-8 BOM temizliği
    if content.startswith(b"\xef\xbb\xbf"):
        content = content[3:]

    # 2. VTT Kontrolü
    is_vtt = "text/vtt" in content_type or content.startswith(b"WEBVTT")
    if is_vtt:
        if not content.startswith(b"WEBVTT"):
            return b"WEBVTT\n\n" + content
        return content

    # 3. SRT -> VTT Dönüşümü
    is_srt = (
        content_type == "application/x-subrip" or 
        url.endswith(".srt") or 
        content.strip().startswith(b"1\r\n") or 
        content.strip().startswith(b"1\n")
    )
    
    if is_srt:
        try:
            content = content.replace(b"\r\n", b"\n")
            content = content.replace(b",", b".") # Zaman formatı düzeltmesi
            if not content.startswith(b"WEBVTT"):
                content = b"WEBVTT\n\n" + content
            return content
        except Exception as e:
            konsol.print(f"[yellow]SRT dönüştürme hatası: {str(e)}[/yellow]")
            
    return content
