# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import os

from Core                 import kekik_FastAPI
from Core.Modules.SpaStaticFiles import SpaStaticFiles

_SPA_DIR = "Public/App"

if os.path.isdir(_SPA_DIR):
    kekik_FastAPI.mount("/app", SpaStaticFiles(directory=_SPA_DIR, html=True), name="spa_app")
