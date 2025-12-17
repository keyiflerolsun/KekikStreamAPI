# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core     import Request, HTMLResponse
from .        import home_router, home_template

from Public.API.v1.Libs import plugin_manager, SeriesInfo
from urllib.parse       import quote_plus

@home_router.get("/icerik/{eklenti_adi}", response_class=HTMLResponse)
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
            "title"       : f"{eklenti_adi} - {content.title}",
            "description" : f"{content.title} içeriği",
            "eklenti_adi" : eklenti_adi,
            "content"     : content
        }

        return home_template.TemplateResponse("pages/content.html.j2", context)
    except Exception as hata:
        context = {
            "request"     : request,
            "title"       : f"Hata - {eklenti_adi}",
            "description" : "Bir hata oluştu",
            "hata"        : hata
        }
        return home_template.TemplateResponse("pages/error.html.j2", context)
