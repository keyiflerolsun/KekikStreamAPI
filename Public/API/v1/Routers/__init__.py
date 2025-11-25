# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi  import APIRouter
from Core     import Request
from Settings import CACHE_TIME

api_v1_router         = APIRouter(prefix="/api/v1")
api_v1_global_message = {
    "with" : "https://github.com/keyiflerolsun/KekikStream"
}

@api_v1_router.get("")
async def get_api_v1_router(request: Request):
    return api_v1_global_message


# ! ----------------------------------------» Routers
from .health           import *
from .get_plugin_names import *
from .get_plugin       import *
from .get_main_page    import *
from .search           import *
from .load_item        import *
from .load_links       import *
from .extract          import *