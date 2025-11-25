from CLI               import konsol
from fastapi           import Request, Response
from fastapi.responses import StreamingResponse
from .                 import home_router
from urllib.parse      import unquote
import httpx, json, traceback

# Sabit değerler
DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5)"
DEFAULT_REFERER    = "https://twitter.com/"
DEFAULT_CHUNK_SIZE = 1024 * 64  # 64KB

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


def get_content_type(url: str, response_headers: dict) -> str:
    """URL ve response headers'dan content-type belirle"""
    # Response'dan gelen content-type'ı kontrol et
    content_type = response_headers.get("content-type", "")
    if content_type:
        return content_type
    
    # URL uzantısına göre belirle
    for ext, ct in CONTENT_TYPES.items():
        if ext in url.lower():
            return ct
    
    # Varsayılan
    return "video/mp4"


def prepare_request_headers(request: Request, referer: str, custom_headers: dict) -> dict:
    """İstek başlıklarını hazırla"""
    headers = {
        "User-Agent"      : custom_headers.get("User-Agent", DEFAULT_USER_AGENT),
        "Accept"          : "*/*",
        "Accept-Encoding" : "identity",
        "Connection"      : "keep-alive",
    }
    
    # Range header varsa ekle
    if "Range" in request.headers:
        headers["Range"] = request.headers["Range"]
    
    # Referer ekle
    if referer and referer != "None":
        headers["Referer"] = unquote(referer)
    else:
        headers["Referer"] = DEFAULT_REFERER
    
    # Özel başlıkları ekle
    for key, value in custom_headers.items():
        if key not in headers:
            headers[key] = value
    
    return headers


def prepare_response_headers(response_headers: dict, url: str) -> dict:
    """Yanıt başlıklarını hazırla"""
    headers = {**CORS_HEADERS}
    
    # Content-Type belirle ve ekle
    headers["Content-Type"] = get_content_type(url, response_headers)
    
    # Önemli başlıkları kopyala (Content-Length HARİÇ - streaming'de sorun çıkarır!)
    important_headers = [
        "content-range", "accept-ranges",
        "etag", "cache-control", "content-disposition"
    ]
    
    for header in important_headers:
        if header in response_headers:
            headers[header.title()] = response_headers[header]
    
    # Accept-Ranges yoksa ekle
    if "Accept-Ranges" not in headers:
        headers["Accept-Ranges"] = "bytes"
    
    return headers


@home_router.get("/proxy/video")
@home_router.head("/proxy/video")
async def video_proxy(request: Request, url: str, referer: str = None, headers: str = None):
    """Video proxy endpoint'i"""
    # URL'i decode et
    decoded_url = unquote(url)
    
    # Custom headers'ı parse et
    custom_headers = {}
    if headers:
        try:
            custom_headers = json.loads(headers)
        except json.JSONDecodeError as e:
            konsol.print(f"[yellow]Header parsing hatası: {str(e)}[/yellow]")
    
    # konsol.print(f"[cyan]Video proxy:[/cyan] {decoded_url[:100]}...")
    
    # Request headers hazırla
    request_headers = prepare_request_headers(request, referer, custom_headers)
    
    # Generator fonksiyonu - kendi client'ını yönetir
    async def stream_with_client():
        client = None
        try:
            # Client oluştur
            client = httpx.AsyncClient(
                follow_redirects = True,
                timeout          = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0),
            )
            
            # Stream başlat
            async with client.stream("GET", decoded_url, headers=request_headers) as response:
                # konsol.print(f"[cyan]Stream başlatıldı: HTTP {response.status_code}[/cyan]")
                
                original_content_type = response.headers.get('content-type', 'bilinmiyor')
                # konsol.print(f"[cyan]Content-Type (sunucu): {original_content_type}[/cyan]")
                
                # Hata kontrolü
                if response.status_code >= 400:
                    konsol.print(f"[red]Kaynak sunucu hatası: HTTP {response.status_code}[/red]")
                    return
                
                # İlk chunk'ı al ve içeriği kontrol et
                first_chunk = None
                corrected_content_type = None
                
                async for chunk in response.aiter_bytes(chunk_size=DEFAULT_CHUNK_SIZE):
                    if first_chunk is None:
                        first_chunk = chunk
                        # konsol.print(f"[green]İlk chunk alındı ({len(chunk)} bytes)[/green]")
                        
                        # İçerik kontrolü - HLS manifest mi?
                        try:
                            content_preview = first_chunk[:100].decode('utf-8', errors='ignore')
                            if content_preview.strip().startswith('#EXTM3U'):
                                corrected_content_type = 'application/vnd.apple.mpegurl'
                                # konsol.print(f"[yellow]⚠️  HLS manifest tespit edildi, Content-Type düzeltildi![/yellow]")
                        except:
                            pass
                        
                        # HTML uyarısı
                        if 'text/html' in original_content_type.lower() and not corrected_content_type:
                            konsol.print(f"[red]⚠️  UYARI: Kaynak HTML döndürüyor, video değil![/red]")
                    
                    yield chunk
                
                # konsol.print(f"[green]Stream tamamlandı[/green]")
        
        except httpx.RequestError as e:
            konsol.print(f"[red]Stream request hatası: {str(e)}[/red]")
        except httpx.TimeoutException as e:
            konsol.print(f"[red]Stream timeout hatası: {str(e)}[/red]")
        except Exception as e:
            konsol.print(f"[red]Stream hatası: {str(e)}[/red]")
            konsol.print(traceback.format_exc())
        finally:
            # Client'ı temizle
            if client:
                await client.aclose()
    
    # StreamingResponse döndür - headers'ı belirleme için HEAD request dene
    # Ancak Content-Type'ı URL'den ve içerikten tahmin edelim
    detected_content_type = None
    
    # URL bazlı tahmin (PHP endpoint'leri ve .txt manifest'leri genelde HLS döndürür)
    if '.m3u8' in decoded_url or '/m.php' in decoded_url or '/l.php' in decoded_url or '/ld.php' in decoded_url or 'master.txt' in decoded_url:
        detected_content_type = 'application/vnd.apple.mpegurl'
        # konsol.print(f"[yellow]URL'den HLS formatı tahmin edildi[/yellow]")
    
    
    # Default headers hazırlama fonksiyonu
    def get_default_headers():
        return {
            "Content-Type": detected_content_type or get_content_type(decoded_url, {}),
            **CORS_HEADERS,
            "Accept-Ranges": "bytes"
        }
    
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            # Önce HEAD request dene
            try:
                response = await client.head(decoded_url, headers=request_headers)
                
                # HEAD başarılıysa headers'ı al
                if response.status_code < 400:
                    response_headers = prepare_response_headers(dict(response.headers), decoded_url)
                    
                    # Content-Type düzeltmesi - URL'den tahmin ettiyse override et
                    if detected_content_type:
                        response_headers["Content-Type"] = detected_content_type
                        # konsol.print(f"[yellow]Content-Type düzeltildi: {detected_content_type}[/yellow]")
                else:
                    # HEAD başarısız, default headers kullan
                    raise Exception("HEAD failed")
            
            except:
                # HEAD başarısız veya desteklenmiyor, default headers kullan
                # konsol.print(f"[yellow]HEAD request başarısız, default headers kullanılıyor[/yellow]")
                response_headers = get_default_headers()
    
    except Exception as e:
        # konsol.print(f"[yellow]Header alma hatası (devam ediliyor): {str(e)}[/yellow]")
        # Hata olsa bile default headers ile devam et
        response_headers = get_default_headers()
    
    # HEAD request ise sadece headers döndür (StreamingResponse döndürme)
    if request.method == "HEAD":
        # konsol.print(f"[cyan]HEAD request - sadece headers döndürülüyor[/cyan]")
        return Response(
            content     = b"",  # Boş content
            status_code = 200,
            headers     = response_headers,
            media_type  = response_headers.get("Content-Type", "video/mp4")
        )
    
    # GET request - normal streaming
    return StreamingResponse(
        stream_with_client(),
        status_code = 200,
        headers     = response_headers,
        media_type  = response_headers.get("Content-Type", "video/mp4")
    )



@home_router.get("/proxy/subtitle")
async def subtitle_proxy(request: Request, url: str, referer: str = None, headers: str = None):
    """Altyazı proxy endpoint'i"""
    try:
        # URL'i decode et
        decoded_url = unquote(url)
        
        # Custom headers'ı parse et
        custom_headers = {}
        if headers:
            try:
                custom_headers = json.loads(headers)
            except json.JSONDecodeError as e:
                konsol.print(f"[yellow]Altyazı header parsing hatası: {str(e)}[/yellow]")
        
        # konsol.print(f"[cyan]Altyazı proxy:[/cyan] {decoded_url[:100]}...")
        
        # Request headers hazırla (video proxy ile aynı fonksiyonu kullan)
        request_headers = prepare_request_headers(request, referer, custom_headers)
        
        # HTTPX client oluştur
        async with httpx.AsyncClient(
            follow_redirects = True,
            timeout          = 30.0
        ) as client:
            response = await client.get(decoded_url, headers=request_headers)
            
            # Hata kontrolü
            if response.status_code >= 400:
                # konsol.print(f"[red]Altyazı kaynağı hatası: HTTP {response.status_code}[/red]")
                return Response(
                    content     = f"Altyazı kaynağı hatası: HTTP {response.status_code}",
                    status_code = response.status_code,
                    media_type  = "text/plain",
                    headers     = CORS_HEADERS
                )
            
            content = response.content
            content_type = response.headers.get("content-type", "")
            
            # VTT formatını düzelt
            if "text/vtt" in content_type or content.startswith(b"WEBVTT") or content.startswith(b"\xef\xbb\xbfWEBVTT"):
                # UTF-8 BOM'u kaldır
                if content.startswith(b"\xef\xbb\xbf"):
                    content = content[3:]
                
                # WEBVTT başlığı yoksa ekle
                if not content.startswith(b"WEBVTT"):
                    content = b"WEBVTT\n\n" + content
            
            # SRT formatını VTT'ye dönüştür
            elif content_type == "application/x-subrip" or decoded_url.endswith(".srt") or \
                 content.strip().startswith(b"1\r\n") or content.strip().startswith(b"1\n"):
                try:
                    # WEBVTT başlığı ekle
                    if not content.startswith(b"WEBVTT"):
                        content = content.replace(b"\r\n", b"\n")
                        content = b"WEBVTT\n\n" + content
                        # Zaman formatını düzelt (,000 -> .000)
                        content = content.replace(b",", b".")
                except Exception as e:
                    konsol.print(f"[yellow]SRT dönüştürme hatası: {str(e)}[/yellow]")
            
            # Response headers
            response_headers = {
                "Content-Type": "text/vtt; charset=utf-8",
                **CORS_HEADERS
            }
            
            return Response(
                content     = content,
                status_code = 200,
                headers     = response_headers,
                media_type  = "text/vtt"
            )
    
    except httpx.RequestError as e:
        # konsol.print(f"[red]Altyazı istek hatası: {str(e)}[/red]")
        return Response(
            content     = f"Altyazı istek hatası: {str(e)}",
            status_code = 502,
            media_type  = "text/plain",
            headers     = CORS_HEADERS
        )
    
    except httpx.TimeoutException as e:
        # konsol.print(f"[red]Altyazı zaman aşımı: {str(e)}[/red]")
        return Response(
            content     = f"Altyazı zaman aşımı: {str(e)}",
            status_code = 504,
            media_type  = "text/plain",
            headers     = CORS_HEADERS
        )
    
    except Exception as e:
        # konsol.print(f"[red]Altyazı proxy hatası: {str(e)}[/red]")
        # konsol.print(traceback.format_exc())
        return Response(
            content     = f"Altyazı proxy hatası: {str(e)}",
            status_code = 500,
            media_type  = "text/plain",
            headers     = CORS_HEADERS
        )