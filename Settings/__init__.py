# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from pathlib import Path
from yaml    import load, FullLoader
import os

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
except ImportError:
    pass  # python-dotenv yüklü değilse, sadece os.getenv kullan

with open("AYAR.yml", "r", encoding="utf-8") as yaml_dosyasi:
    AYAR = load(yaml_dosyasi, Loader=FullLoader)

PRODUCTION = os.getenv("PRODUCTION", "false").lower() == "true"

HOST       = AYAR["APP"]["HOST"]
PORT       = AYAR["APP"]["PORT"]
CACHE_TIME = AYAR["APP"]["CACHE"] * 60

SECRET_KEY      = os.getenv("SECRET_KEY", "cokomelli_secret")
SESSION_COOKIE  = os.getenv("SESSION_COOKIE", "session")
SESSION_MAX_AGE = int(os.getenv("SESSION_MAX_AGE", "86400"))  # Varsayılan 1 gün

MONGODB_URI     = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "kurek_db")

REDIS_HOST     = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT     = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

# Telegram bot için AYAR'a ekle
TG = {
    "token"    : os.getenv("TELEGRAM_BOT_TOKEN", ""),
    "username" : os.getenv("TELEGRAM_BOT_USERNAME", "")
}
