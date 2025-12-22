# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi                 import FastAPI, Request, Response, HTTPException, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from Core.Modules            import lifespan
from fastapi.staticfiles     import StaticFiles
from fastapi.responses       import JSONResponse, HTMLResponse, RedirectResponse, PlainTextResponse, FileResponse
from fastapi_csrf_protect    import CsrfProtect
from Settings                import PROJE

kekik_FastAPI = FastAPI(
    title       = PROJE,
    openapi_url = None,
    docs_url    = None,
    redoc_url   = None,
    lifespan    = lifespan
)

# ! ----------------------------------------» Middlewares

kekik_FastAPI.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
kekik_FastAPI.add_middleware(GZipMiddleware, minimum_size=1000)

# ! ----------------------------------------» Routers

from Core.Modules              import _istek, _hata, _csrf, _security
from Public.Home.Routers       import home_router
from Public.API.v1.Routers     import api_v1_router
from Public.Proxy.Routers      import proxy_router
from Public.WebSocket.Routers  import wss_router
from Public.WatchParty.Routers import wp_router

kekik_FastAPI.include_router(home_router)
kekik_FastAPI.mount("/static/home", StaticFiles(directory="Public/Home/Static"), name="static_home")

kekik_FastAPI.include_router(api_v1_router)

kekik_FastAPI.include_router(proxy_router)

kekik_FastAPI.include_router(wss_router)
kekik_FastAPI.include_router(wp_router)
kekik_FastAPI.mount("/static/wp", StaticFiles(directory="Public/WatchParty/Static"), name="static_watchparty")
