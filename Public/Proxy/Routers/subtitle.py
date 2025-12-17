# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi        import Request, Response
from .              import proxy_router
from ..Libs.helpers import prepare_request_headers, process_subtitle_content, CORS_HEADERS
from urllib.parse   import unquote
import httpx

@proxy_router.get("/subtitle")
async def subtitle_proxy(request: Request, url: str, referer: str = None, user_agent: str = None):
    """Altyazı proxy endpoint'i"""
    try:
        decoded_url     = unquote(url)
        request_headers = prepare_request_headers(request, decoded_url, referer, user_agent)
        
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0, verify=False) as client:
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
