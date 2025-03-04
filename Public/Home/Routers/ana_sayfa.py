# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI      import konsol
from Core     import kekik_cache, Request, HTMLResponse
from .        import home_router, home_template
from Settings import CACHE_TIME

from Public.API.v1.Libs import plugin_manager
from cloudscraper       import CloudScraper

@home_router.get("/", response_class=HTMLResponse)
@kekik_cache(ttl=CACHE_TIME, is_fastapi=True)
async def ana_sayfa(request: Request):

    # oturum = CloudScraper()

    plugins = []
    for name in plugin_manager.get_plugin_names():
        plugin = plugin_manager.select_plugin(name)
        # if plugin.name in ["Shorten", "JetFilmizle"]:
        #     continue

        # istek = oturum.get(plugin.main_url)
        # if istek.status_code != 200:
        #     konsol.log(f"[red][!] {plugin.name:<20} » {istek.status_code}")
        #     continue

        plugins.append({
            "name"        : plugin.name,
            "description" : plugin.description,
            "language"    : plugin.language,
            "main_url"    : plugin.main_url,
            "favicon"     : plugin.favicon
        })

    context = {
        "request"  : request,
        "baslik"   : "Tüm Eklentiler",
        "plugins"  : plugins
    }

    return home_template.TemplateResponse("index.html", context)