# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi                 import FastAPI, Request, Response, HTTPException, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.gzip import DEFAULT_EXCLUDED_CONTENT_TYPES
from Core.Modules            import lifespan
from fastapi.staticfiles     import StaticFiles
from fastapi.responses       import JSONResponse, HTMLResponse, RedirectResponse, PlainTextResponse, FileResponse
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
kekik_FastAPI.add_middleware(GZipMiddleware, minimum_size=1000, exclude_content_types=DEFAULT_EXCLUDED_CONTENT_TYPES + ("application/octet-stream", "application/vnd.apple.mpegurl", "application/x-mpegurl"))

# ! ----------------------------------------» Routers

from Core.Modules          import _istek, _hata, _security, _spa, _access_log
from Public.Home.Routers   import home_router
from Public.API.v1.Routers import api_v1_router

# `uvicorn.access` erişim günlüğüne stream-proxy token'ı sızdıran tam istek satırının
# (GET /api/v1/stream-proxy?t=<token>) yazılmasını engeller. Burada (import zamanında)
# takılması gerekir: hem `basla.py` hem de doğrudan `uvicorn Core:kekik_FastAPI`
# (systemd birimi bu şekilde başlatır) aynı yoldan geçer; böylece filtre her iki
# başlatma biçiminde de etkindir.
_access_log.erisim_logu_gizle()

kekik_FastAPI.include_router(home_router)
kekik_FastAPI.mount("/static/home", StaticFiles(directory="Public/Home/Static"), name="static_home")

kekik_FastAPI.include_router(api_v1_router)
