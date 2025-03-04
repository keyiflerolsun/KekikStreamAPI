# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core     import kekik_cache, Request, HTMLResponse
from .        import home_router, home_template
from Settings import CACHE_TIME

from Public.API.v1.Libs import plugin_manager
from urllib.parse       import quote_plus

@home_router.get("/eklenti/{eklenti_adi}", response_class=HTMLResponse)
@kekik_cache(ttl=CACHE_TIME, is_fastapi=True)
async def eklenti(request: Request, eklenti_adi: str):
    try:
        plugin_names = plugin_manager.get_plugin_names()
        
        if eklenti_adi not in plugin_names:
            raise ValueError(f"'{eklenti_adi}' Bulunamadı!")

        plugin = plugin_manager.select_plugin(eklenti_adi)

        main_page = {}
        for url, category in plugin.main_page.items():
            main_page[quote_plus(url)] = quote_plus(category)

        plugin = {
            "name"        : plugin.name,
            "language"    : plugin.language,
            "main_url"    : plugin.main_url,
            "favicon"     : plugin.favicon,
            "description" : plugin.description,
            "main_page"   : main_page
        }

        context = {
            "request"  : request,
            "baslik"   : plugin.get("name"),
            "plugin"   : plugin
        }

        return home_template.TemplateResponse("eklenti.html", context)
    except Exception as hata:
        context = {
            "request"  : request,
            "baslik"   : "Hata",
            "hata"     : hata
        }
        return home_template.TemplateResponse("hata.html", context)