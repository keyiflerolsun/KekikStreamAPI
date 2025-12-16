# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi            import APIRouter
from fastapi.templating import Jinja2Templates

home_router   = APIRouter(prefix="")
home_template = Jinja2Templates(directory="Public/Home/Templates")

from . import (
    ana_sayfa,
    eklenti,
    kategori,
    icerik,
    ara,
    izle
)
