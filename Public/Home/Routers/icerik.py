# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core     import kekik_cache, Request, HTMLResponse
from .        import home_router, home_template
from Settings import CACHE_TIME

from Public.API.v1.Libs import plugin_manager, SeriesInfo
from urllib.parse       import quote_plus

@home_router.get("/icerik/{eklenti_adi}", response_class=HTMLResponse)
@kekik_cache(ttl=CACHE_TIME, is_fastapi=True)
async def icerik(request: Request, eklenti_adi: str, url: str):
    try:
        plugin_names = plugin_manager.get_plugin_names()

        if eklenti_adi not in plugin_names:
            raise ValueError(f"'{eklenti_adi}' Bulunamadı!")

        plugin  = plugin_manager.select_plugin(eklenti_adi)
        content = await plugin.load_item(url)

        content.url = quote_plus(content.url)

        if isinstance(content, SeriesInfo):
            for episode in content.episodes:
                episode.url = quote_plus(episode.url)

        context = {
            "request"     : request,
            "baslik"      : f"{eklenti_adi} - {content.title}",
            "eklenti_adi" : eklenti_adi,
            "content"     : content
        }

        return home_template.TemplateResponse("icerik.html", context)
    except Exception as hata:
        context = {
            "request"  : request,
            "baslik"   : "Hata",
            "hata"     : hata
        }
        return home_template.TemplateResponse("hata.html", context)