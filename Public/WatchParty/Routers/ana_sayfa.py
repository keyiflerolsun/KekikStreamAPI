# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core import Request, HTMLResponse, RedirectResponse
from .    import wp_router
import uuid

@wp_router.get("", response_class=HTMLResponse)
async def ana_sayfa(request: Request):
    """Yeni oda oluştur ve yönlendir"""
    room_id = str(uuid.uuid4())[:8].upper()
    return RedirectResponse(url=f"/watch-party/{room_id}", status_code=302)
