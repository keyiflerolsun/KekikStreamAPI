from CLI                  import konsol
from fastapi              import Request, Response
from starlette.background import BackgroundTask
from fastapi.responses    import StreamingResponse
from .                    import home_router
from urllib.parse         import unquote
import httpx, json, traceback

# --- Constants ---
# Sabit değerler
DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5)"
DEFAULT_REFERER    = "https://twitter.com/"
DEFAULT_CHUNK_SIZE = 1024 * 128  # 128KB

# Content-Type mapping
CONTENT_TYPES = {
    ".m3u8" : "application/vnd.apple.mpegurl",
    ".ts"   : "video/mp2t",
    ".mp4"  : "video/mp4",
    ".webm" : "video/webm",
    ".mkv"  : "video/x-matroska",
}

# CORS ayarları
CORS_HEADERS = {
    "Access-Control-Allow-Origin"  : "*",
    "Access-Control-Allow-Methods" : "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers" : "Origin, Content-Type, Accept, Range",
}

# --- Helper Functions ---

def parse_custom_headers(headers_str: str | None) -> dict:
    """JSON string headerları dict'e çevirir"""
    if not headers_str:
        return {}
    try:
        return json.loads(headers_str)
    except json.JSONDecodeError as e:
        konsol.print(f"[yellow]Header parsing hatası: {str(e)}[/yellow]")
        return {}

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

def prepare_request_headers(request: Request, referer: str | None, custom_headers: dict) -> dict:
    """Proxy isteği için headerları hazırlar"""
    headers = {
        "User-Agent"      : custom_headers.get("User-Agent", DEFAULT_USER_AGENT),
        "Accept"          : "*/*",
        "Accept-Encoding" : "identity",
        "Connection"      : "keep-alive",
    }
    
    # Range header transferi
    if range_header := request.headers.get("Range"):
        headers["Range"] = range_header
    
    # Referer ayarı
    headers["Referer"] = unquote(referer) if (referer and referer != "None") else DEFAULT_REFERER
    
    # Custom headerları ekle (varsa üzerine yazar)
    for key, value in custom_headers.items():
        if key not in headers:
            headers[key] = value
            
    return headers

def prepare_response_headers(response_headers: dict, url: str, detected_content_type: str = None) -> dict:
    """Client'a dönecek headerları hazırlar"""
    headers = CORS_HEADERS.copy()
    
    # Content-Type belirle
    headers["Content-Type"] = detected_content_type or get_content_type(url, response_headers)
    
    # Transfer edilecek headerlar
    important_headers = [
        "content-range", "accept-ranges",
        "etag", "cache-control", "content-disposition"
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

# --- Video Proxy Logic ---

async def stream_generator(client: httpx.AsyncClient, url: str, headers: dict):
    """Video içeriğini stream eder ve HLS kontrolü yapar"""
    response = None
    try:
        req = client.build_request("GET", url, headers=headers)
        response = await client.send(req, stream=True)
        
        if response.status_code >= 400:
            konsol.print(f"[red]Kaynak sunucu hatası: HTTP {response.status_code}[/red]")
            return

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
            
            try:
                yield chunk
            except GeneratorExit:
                # Client bağlantıyı kesti, döngüden çık
                break
            
    except Exception as e:
        konsol.print(f"[red]Stream hatası: {str(e)}[/red]")
        konsol.print(traceback.format_exc())
    finally:
        if response:
            await response.aclose()

@home_router.get("/proxy/video")
@home_router.head("/proxy/video")
async def video_proxy(request: Request, url: str, referer: str = None, headers: str = None):
    """Video proxy endpoint'i"""
    decoded_url     = unquote(url)
    custom_headers  = parse_custom_headers(headers)
    request_headers = prepare_request_headers(request, referer, custom_headers)
    
    # HLS Tahmini
    detected_content_type = "application/vnd.apple.mpegurl" if detect_hls_from_url(decoded_url) else None
    
    # HEAD Request ile headerları almayı dene
    response_headers = {}
    head_status      = 200
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.head(decoded_url, headers=request_headers)
            if resp.status_code < 400:
                response_headers = dict(resp.headers)
                head_status = resp.status_code
    except:
        pass # HEAD başarısızsa varsayılanları kullanacağız

    # Response headerlarını hazırla
    final_headers = prepare_response_headers(response_headers, decoded_url, detected_content_type)

    # Status Code Belirle (206 Partial Content desteği)
    status_code = 206 if (head_status == 206 or "Content-Range" in final_headers) else 200

    # HEAD isteği ise sadece header dön
    if request.method == "HEAD":
        return Response(
            content     = b"",
            status_code = status_code,
            headers     = final_headers,
            media_type  = final_headers.get("Content-Type")
        )

    # GET isteği ise stream başlat
    # Client oluştur
    client = httpx.AsyncClient(
        follow_redirects = True,
        timeout          = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0),
    )
    
    return StreamingResponse(
        stream_generator(client, decoded_url, request_headers),
        status_code     = status_code,
        headers         = final_headers,
        media_type      = final_headers.get("Content-Type"),
        background      = BackgroundTask(client.aclose)
    )

# --- Subtitle Proxy Logic ---

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

@home_router.get("/proxy/subtitle")
async def subtitle_proxy(request: Request, url: str, referer: str = None, headers: str = None):
    """Altyazı proxy endpoint'i"""
    try:
        decoded_url     = unquote(url)
        custom_headers  = parse_custom_headers(headers)
        request_headers = prepare_request_headers(request, referer, custom_headers)
        
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            response = await client.get(decoded_url, headers=request_headers)
            
            if response.status_code >= 400:
                return Response(
                    content     = f"Altyazı hatası: {response.status_code}", 
                    status_code = response.status_code
                )
            
            processed_content = process_subtitle_content(
                response.content, 
                response.headers.get("content-type", ""), 
                decoded_url
            )
            
            return Response(
                content     = processed_content,
                status_code = 200,
                headers     = {"Content-Type": "text/vtt; charset=utf-8", **CORS_HEADERS},
                media_type  = "text/vtt"
            )
            
    except Exception as e:
        return Response(
            content     = f"Proxy hatası: {str(e)}", 
            status_code = 500
        )
