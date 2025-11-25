# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI      import konsol
from Core     import Request, HTMLResponse
from .        import home_router, home_template

from Public.API.v1.Libs import plugin_manager, extractor_manager
from json               import dumps

@home_router.get("/izle/{eklenti_adi}", response_class=HTMLResponse)
async def izle(request: Request, eklenti_adi: str, url: str, baslik: str):
    try:
        plugin_names = plugin_manager.get_plugin_names()

        if eklenti_adi not in plugin_names:
            raise ValueError(f"'{eklenti_adi}' Bulunamadı!")

        plugin = plugin_manager.select_plugin(eklenti_adi)

        load_links = await plugin.load_links(url)

        links = []
        if hasattr(plugin, "play") and callable(getattr(plugin, "play", None)):
            for link in load_links:
                links.append({
                    "name"      : link.get("name"),
                    "url"       : link.get("url"),
                    "referer"   : link.get("referer"),
                    "headers"   : dumps(link.get("headers")),
                    "subtitles" : [sub.dict() for sub in link.get("subtitles", [])]
                })
        else:
            for link in load_links:
                if extractor := extractor_manager.find_extractor(link.get("url")):
                    try:
                        data = await extractor.extract(link.get("url"), plugin.main_url)
                    except Exception as e:
                        konsol.log(f"[red][!] {eklenti_adi} » {link.get('url')} » {e}")
                        continue

                    if data:
                        links.append({
                            "name"      : link.get("name"),
                            "url"       : data.url,
                            "referer"   : data.referer,
                            "headers"   : dumps(data.headers),
                            "subtitles" : [sub.model_dump() for sub in data.subtitles]
                        })

        context = {
            "request"     : request,
            "title"       : f"{baslik} - {eklenti_adi}",
            "description" : f"{baslik} izleme sayfası",
            "eklenti_adi" : f"{eklenti_adi}",
            "links"       : links
        }

        return home_template.TemplateResponse("izle.html.j2", context)
    except Exception as hata:
        context = {
            "request"     : request,
            "title"       : f"Hata - {eklenti_adi} - {baslik}",
            "description" : "Bir hata oluştu",
            "hata"        : hata
        }
        return home_template.TemplateResponse("hata.html.j2", context)