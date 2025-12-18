# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI                  import konsol
from fastapi              import Request, Response
from starlette.background import BackgroundTask
from fastapi.responses    import StreamingResponse
from .                    import proxy_router
from ..Libs.helpers       import prepare_request_headers, prepare_response_headers, detect_hls_from_url, stream_wrapper, rewrite_hls_manifest
from ..Libs.segment_cache import segment_cache
from urllib.parse         import unquote
import httpx

def is_hls_segment(url: str) -> bool:
    """URL'nin HLS segment'i olup olmadığını kontrol et"""
    url_lower = url.lower()

    # Manifest'leri hariç tut
    if ".m3u8" in url_lower:
        return False

    # Segment göstergeleri
    segment_indicators = (".ts", ".m4s", "seg-", "chunk-", "fragment", ".png")
    return any(indicator in url_lower for indicator in segment_indicators)

@proxy_router.get("/video")
@proxy_router.head("/video")
async def video_proxy(request: Request, url: str, referer: str = None, user_agent: str = None):
    """Video proxy endpoint'i"""
    decoded_url     = unquote(url)
    request_headers = prepare_request_headers(request, decoded_url, referer, user_agent)

    # HLS segment ise cache'i kontrol et
    if is_hls_segment(decoded_url):
        cached_content = await segment_cache.get(decoded_url)
        if cached_content:
            # konsol.print(f"[green]✓ Cache HIT:[/green] {decoded_url[-50:]}")
            return Response(
                content     = cached_content,
                status_code = 200,
                headers     = {
                    "Content-Type"                : "video/MP2T" if decoded_url.endswith('.ts') else "video/iso.segment",
                    "Cache-Control"               : "public, max-age=30",
                    "Access-Control-Allow-Origin" : "*",
                },
            )

    # Client oluştur (SSL doğrulaması devre dışı - bazı sunucular self-signed sertifika kullanıyor)
    client = httpx.AsyncClient(
        follow_redirects = True,
        timeout          = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0),
        verify           = False,
    )

    try:
        # HLS Tahmini (URL'den)
        is_hls = detect_hls_from_url(decoded_url)
        detected_content_type = "application/vnd.apple.mpegurl" if is_hls else None

        # GET isteğini başlat
        req = client.build_request("GET", decoded_url, headers=request_headers)
        response = await client.send(req, stream=True)

        if response.status_code >= 400:
            await response.aclose()
            await client.aclose()
            return Response(status_code=response.status_code, content=f"Upstream Error: {response.status_code}")

        # Response headerlarını hazırla
        final_headers = prepare_response_headers(dict(response.headers), decoded_url, detected_content_type)

        # HEAD isteği ise stream yapma, kapat ve dön
        if request.method == "HEAD":
            await response.aclose()
            await client.aclose()
            return Response(
                content     = b"",
                status_code = response.status_code,
                headers     = final_headers,
                media_type  = final_headers.get("Content-Type")
            )

        # HLS manifest ise içeriği yeniden yaz
        if is_hls:
            # Tüm içeriği oku
            content = await response.aread()
            await response.aclose()
            await client.aclose()

            # Manifest URL'lerini yeniden yaz
            rewritten_content = rewrite_hls_manifest(content, decoded_url, referer, user_agent)

            # Content-Length güncelle
            final_headers["Content-Length"] = str(len(rewritten_content))

            return Response(
                content     = rewritten_content,
                status_code = response.status_code,
                headers     = final_headers,
                media_type  = final_headers.get("Content-Type")
            )

        # HLS segment ise cache'e al
        if is_hls_segment(decoded_url):
            content = await response.aread()
            await response.aclose()
            await client.aclose()

            # Cache'e ekle
            await segment_cache.set(decoded_url, content)
            # konsol.print(f"[yellow]⚡ Cache MISS:[/yellow] {decoded_url[-50:]} ({len(content) // 1024}KB)")

            return Response(
                content     = content,
                status_code = response.status_code,
                headers     = final_headers,
                media_type  = final_headers.get("Content-Type")
            )

        # Normal video - StreamingResponse döndür
        return StreamingResponse(
            stream_wrapper(response),
            status_code = response.status_code,
            headers     = final_headers,
            media_type  = final_headers.get("Content-Type"),
            background  = BackgroundTask(client.aclose)
        )

    except Exception as e:
        await client.aclose()
        konsol.print(f"[red]Proxy başlatma hatası: {str(e)}[/red]")
        return Response(status_code=502, content=f"Proxy Error: {str(e)}")
