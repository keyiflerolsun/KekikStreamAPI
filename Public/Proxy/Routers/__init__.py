# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi import APIRouter
from Core    import Request

proxy_router         = APIRouter(prefix="/proxy")
proxy_global_message = {
    "with" : "https://github.com/keyiflerolsun/KekikStream"
}

@proxy_router.get("")
async def get_proxy_router(request: Request):
    return proxy_global_message

from . import video, subtitle
