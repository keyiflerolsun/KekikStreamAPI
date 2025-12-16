# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi            import APIRouter
from fastapi.templating import Jinja2Templates

wp_router   = APIRouter(prefix="/watch-party")
wp_template = Jinja2Templates(directory="Public/WatchParty/Templates")

from . import ana_sayfa, room
