# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from .      import api_v1_router, api_v1_global_message
from Core   import Request, JSONResponse
from ..Libs import plugin_manager
from random import choice

@api_v1_router.get("/load_links")
async def load_links(request:Request):
    istek = request.state.veri
    plugin_names = plugin_manager.get_plugin_names()
    if not istek:
        return JSONResponse(status_code=410, content={"hata": f"{request.url.path}?plugin={choice(plugin_names)}&encoded_url="})

    _plugin      = istek.get("plugin")
    _plugin      = _plugin if _plugin in plugin_names else None
    _encoded_url = istek.get("encoded_url")
    if not _plugin or not _encoded_url:
        return JSONResponse(status_code=410, content={"hata": f"{request.url.path}?plugin={_plugin or choice(plugin_names)}&encoded_url="})

    plugin = plugin_manager.select_plugin(_plugin)
    links  = await plugin.load_links(_encoded_url)

    result = []
    for link in links:
        result.append({
            "name"       : link.get("name"),
            "url"        : link.get("url"),
            "referer"    : link.get("referer", ""),
            "user_agent" : link.get("user_agent", ""),
            "subtitles"  : link.get("subtitles")
        })

    return {**api_v1_global_message, "result": result}