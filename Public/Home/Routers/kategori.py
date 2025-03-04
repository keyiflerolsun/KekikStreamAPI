# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core     import kekik_cache, Request, HTMLResponse
from .        import home_router, home_template
from Settings import CACHE_TIME

from Public.API.v1.Libs import plugin_manager
from urllib.parse       import quote_plus

@home_router.get("/kategori/{eklenti_adi}", response_class=HTMLResponse)
@kekik_cache(ttl=CACHE_TIME, is_fastapi=True)
async def kategori(request: Request, eklenti_adi: str, kategori_url: str, kategori_adi: str, sayfa: int = 1):
    try:
        plugin_names = plugin_manager.get_plugin_names()
        
        if eklenti_adi not in plugin_names:
            raise ValueError(f"'{eklenti_adi}' Bulunamadı!")

        plugin = plugin_manager.select_plugin(eklenti_adi)
        items  = await plugin.get_main_page(sayfa, kategori_url, kategori_adi)
        for icerik in items:
            icerik.url = quote_plus(icerik.url)

        context = {
            "request"      : request,
            "baslik"       : f"{eklenti_adi} - {kategori_adi}",
            "eklenti_adi"  : eklenti_adi,
            "items"        : items,
            "kategori_url" : quote_plus(kategori_url),
            "kategori_adi" : quote_plus(kategori_adi),
            "sayfa"        : sayfa
        }

        return home_template.TemplateResponse("kategori.html", context)
    except Exception as hata:
        context = {
            "request"  : request,
            "baslik"   : "Hata",
            "hata"     : hata
        }
        return home_template.TemplateResponse("hata.html", context)