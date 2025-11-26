# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core import Request, HTMLResponse, CsrfProtect, Depends
from .    import home_router, home_template
from Public.API.v1.Libs import plugin_manager
from cloudscraper       import CloudScraper

@home_router.get("/", response_class=HTMLResponse)
async def ana_sayfa(request: Request, csrf_protect: CsrfProtect = Depends()):

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
        "request"     : request,
        "title"       : "KekikStream - Tüm Eklentiler",
        "description" : "KekikStream API Tüm Eklentiler Sayfası",
        "plugins"     : plugins
    }

    # CSRF token
    csrf_token, signed_token = csrf_protect.generate_csrf_tokens()
    context["csrf_token"]    = csrf_token

    # Response
    response = home_template.TemplateResponse("pages/home.html.j2", context)
    csrf_protect.set_csrf_cookie(signed_token, response)

    response.headers["X-Robots-Tag"] = "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
    return response
