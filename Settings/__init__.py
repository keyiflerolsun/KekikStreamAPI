# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from pathlib import Path
from yaml    import load, FullLoader
from dotenv  import load_dotenv
import os

# .env yükleme
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# AYAR.yml yükleme
with open("AYAR.yml", "r", encoding="utf-8") as yaml_dosyasi:
    AYAR = load(yaml_dosyasi, Loader=FullLoader)

# Genel ayarlar
PRODUCTION = os.getenv("PRODUCTION", "false").lower() == "true"

PROJE = AYAR["PROJE"]
HOST  = AYAR["APP"]["HOST"]
PORT  = AYAR["APP"]["PORT"]

# Güvenlik / Session
SECRET_KEY      = os.getenv("SECRET_KEY", "cokomelli_secret")
SESSION_COOKIE  = f"{PROJE.lower()}_session"
SESSION_MAX_AGE = int(os.getenv("SESSION_MAX_AGE", "86400"))

PROXY_ENABLED = os.getenv("PROXY_ENABLED", "true").lower() == "true"
AVAILABILITY_CHECK = os.getenv("AVAILABILITY_CHECK", "true").lower() == "true"

# Servis URL'leri
API_URL   = os.getenv("API_URL", "http://kekik_api:3310")
PROXY_URL = os.getenv("PROXY_URL", ":3311")
WS_URL    = os.getenv("WS_URL",    ":3312")
