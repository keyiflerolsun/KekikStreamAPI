# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI                  import konsol
from fastapi              import Request, Response
from starlette.background import BackgroundTask
from fastapi.responses    import StreamingResponse
from .                    import proxy_router
from ..Libs.helpers       import prepare_request_headers, prepare_response_headers, detect_hls_from_url, stream_wrapper
from urllib.parse         import unquote
import httpx

@proxy_router.get("/video")
@proxy_router.head("/video")
async def video_proxy(request: Request, url: str, referer: str = None, user_agent: str = None):
    """Video proxy endpoint'i"""
    decoded_url     = unquote(url)
    request_headers = prepare_request_headers(request, decoded_url, referer, user_agent)

    # Client oluştur
    client = httpx.AsyncClient(
        follow_redirects = True,
        timeout          = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0),
    )
    
    try:
        # GET isteğini başlat
        req = client.build_request("GET", decoded_url, headers=request_headers)
        response = await client.send(req, stream=True)
        
        if response.status_code >= 400:
            await response.aclose()
            await client.aclose()
            return Response(status_code=response.status_code, content=f"Upstream Error: {response.status_code}")

        # Response headerlarını hazırla
        # HLS Tahmini (URL'den)
        detected_content_type = "application/vnd.apple.mpegurl" if detect_hls_from_url(decoded_url) else None
        
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

        # GET isteği - StreamingResponse döndür
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
