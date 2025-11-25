# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from .        import api_v1_router, api_v1_global_message
from Core     import Request
from ..Libs   import plugin_manager

@api_v1_router.get("/get_plugin_names")
async def get_plugin_names(request: Request):
    plugin_names = plugin_manager.get_plugin_names()

    return {**api_v1_global_message, "result": plugin_names}