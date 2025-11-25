# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi_csrf_protect import CsrfProtect
from pydantic_settings    import BaseSettings
from Settings             import SECRET_KEY, PRODUCTION

class CsrfSettings(BaseSettings):
    secret_key: str      = SECRET_KEY
    cookie_key: str      = "kekik-csrf"
    cookie_samesite: str = "lax"
    cookie_secure: bool  = PRODUCTION

@CsrfProtect.load_config
def get_csrf_config():
    return CsrfSettings()
