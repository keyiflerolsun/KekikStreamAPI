# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core import Request, HTMLResponse
from .    import home_router, home_template

from Public.API.v1.Libs import plugin_manager

@home_router.get("/izle/{eklenti_adi}", response_class=HTMLResponse)
async def izle(request: Request, eklenti_adi: str, url: str, baslik: str):
    try:
        plugin_names = plugin_manager.get_plugin_names()

        if eklenti_adi not in plugin_names:
            raise ValueError(f"'{eklenti_adi}' Bulunamadı!")

        plugin = plugin_manager.select_plugin(eklenti_adi)

        load_links = await plugin.load_links(url)

        links = []
        for link in load_links:
            subtitles = []
            if link.subtitles:
                subtitles = [sub.model_dump() for sub in link.subtitles]
            
            links.append({
                "name"       : link.name,
                "url"        : link.url,
                "referer"    : link.referer or "",
                "user_agent" : link.user_agent or "",
                "subtitles"  : subtitles
            })

        context = {
            "request"     : request,
            "title"       : baslik,
            "description" : f"{baslik} izleme sayfası",
            "eklenti_adi" : f"{eklenti_adi}",
            "icerik_url"  : request.headers.get("referer").split("?url=")[1] if request.headers.get("referer") else None,
            "links"       : links
        }

        return home_template.TemplateResponse("pages/player.html.j2", context)
    except Exception as hata:
        context = {
            "request"     : request,
            "title"       : f"Hata - {eklenti_adi} - {baslik}",
            "description" : "Bir hata oluştu",
            "hata"        : hata
        }
        return home_template.TemplateResponse("pages/error.html.j2", context)
