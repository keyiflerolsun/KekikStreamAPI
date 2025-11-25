# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core     import Request, HTMLResponse
from .        import home_router, home_template

from Public.API.v1.Libs import plugin_manager
from urllib.parse       import quote_plus

@home_router.get("/ara/{eklenti_adi}", response_class=HTMLResponse)
async def ara(request: Request, eklenti_adi: str, sorgu: str):
    try:
        plugin_names = plugin_manager.get_plugin_names()

        if eklenti_adi not in plugin_names:
            raise ValueError(f"'{eklenti_adi}' Bulunamadı!")

        plugin = plugin_manager.select_plugin(eklenti_adi)
        results = await plugin.search(sorgu)

        for elem in results:
            elem.url = quote_plus(elem.url)

        context = {
            "request"     : request,
            "title"       : f"{eklenti_adi} - {sorgu}",
            "description" : f"{eklenti_adi} eklentisinde '{sorgu}' için arama sonuçları",
            "eklenti_adi" : eklenti_adi,
            "sorgu"       : sorgu,
            "results"     : results
        }

        return home_template.TemplateResponse("ara.html.j2", context)
    except Exception as hata:
        context = {
            "request"     : request,
            "title"       : f"Hata - {eklenti_adi} - {sorgu}",
            "description" : "Bir hata oluştu",
            "hata"        : hata
        }
        return home_template.TemplateResponse("hata.html.j2", context)