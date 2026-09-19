# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core    import Request
from fastapi import APIRouter

api_v1_router         = APIRouter(prefix="/api/v1")
api_v1_global_message = {
    "with" : "https://github.com/keyiflerolsun/KekikStream"
}

@api_v1_router.get("")
async def get_api_v1_router(request: Request):
    return api_v1_global_message


# ! ----------------------------------------» Routers
from . import (
    health,
    get_plugin_names,
    get_all_plugins,
    get_plugin,
    get_main_page,
    search,
    global_search,
    load_item,
    load_links,
    extract,
    ytdlp_extract,
    stream_proxy
)
