# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core                  import Request, HTMLResponse
from .                     import wp_router, wp_template
from Public.WebSocket.Libs import watch_party_manager
from Settings              import PROXY_ENABLED, PROXY_URL, WS_URL

@wp_router.get("/{room_id}", response_class=HTMLResponse)
async def watch_party_room(
    request: Request,
    room_id: str,
    url: str        = None,
    title: str      = None,
    user_agent: str = None,
    referer: str    = None,
    subtitle: str   = None
):
    """Watch Party odası sayfası"""
    room_id = room_id.upper()

    # Mevcut oda varsa bilgilerini al
    room = await watch_party_manager.get_room(room_id)

    # Autoload context (query parametreleri varsa)
    autoload = None
    if url:
        autoload = {
            "url"        : url,
            "title"      : title or "",
            "user_agent" : user_agent or "",
            "referer"    : referer or "",
            "subtitle"   : subtitle or "",
        }

    context = {
        "request"       : request,
        "site_name"     : "Watch Party",
        "title"         : f"Watch Party - Oda: {room_id}",
        "description"   : "Birlikte video izle! YouTube, M3U/HLS ve daha fazlası.",
        "room_id"       : room_id,
        "room"          : room,
        "proxy_enabled" : PROXY_ENABLED,
        "proxy_url"     : PROXY_URL,
        "ws_url"        : WS_URL,
        "autoload"      : autoload,
    }

    return wp_template.TemplateResponse("pages/index.html.j2", context)
