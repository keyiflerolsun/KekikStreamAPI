# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core     import kekik_cache, Request, HTMLResponse
from .        import home_router, home_template
from Settings import CACHE_TIME

from Public.API.v1.Libs import plugin_manager, extractor_manager
from json               import dumps

@home_router.get("/izle/{eklenti_adi}", response_class=HTMLResponse)
@kekik_cache(ttl=CACHE_TIME, is_fastapi=True)
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
                data = plugin._data.get(link, {})
                links.append({
                    "name"      : data.get("name"),
                    "url"       : link,
                    "referer"   : data.get("referer"),
                    "headers"   : dumps(data.get("headers")),
                    "subtitles" : [sub.dict() for sub in data.get("subtitles", [])]
                })
            plugin._data.clear()
        else:
            for link in load_links:
                if extractor := extractor_manager.find_extractor(link):
                    data = await extractor.extract(link, plugin.main_url)
                    if data:
                        links.append({
                            "name"      : data.name,
                            "url"       : data.url,
                            "referer"   : data.referer,
                            "headers"   : dumps(data.headers),
                            "subtitles" : [sub.dict() for sub in data.subtitles]
                        })

        context = {
            "request"     : request,
            "baslik"      : f"{eklenti_adi} | {baslik}",
            "eklenti_adi" : f"{eklenti_adi}",
            "links"       : links
        }

        return home_template.TemplateResponse("izle.html", context)
    except Exception as hata:
        context = {
            "request"  : request,
            "baslik"   : "Hata",
            "hata"     : hata
        }
        return home_template.TemplateResponse("hata.html", context)