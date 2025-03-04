# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi            import APIRouter
from fastapi.templating import Jinja2Templates

home_router   = APIRouter()
home_template = Jinja2Templates(directory="Public/Home/Templates")

from .ana_sayfa import *
from .eklenti   import *
from .kategori  import *
from .icerik    import *
from .ara       import *
from .izle      import *
from .proxy     import *