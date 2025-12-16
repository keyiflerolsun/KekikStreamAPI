# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from yaml import load, FullLoader

# AYAR.yml yükleme
with open("AYAR.yml", "r", encoding="utf-8") as yaml_dosyasi:
    AYAR = load(yaml_dosyasi, Loader=FullLoader)

# Genel ayarlar
PROJE = AYAR["PROJE"]
HOST  = AYAR["APP"]["HOST"]
PORT  = AYAR["APP"]["PORT"]

SECRET_KEY = "cokgizliandunpaylasmabuyasakaldir"
PRODUCTION = True

PROXY_ENABLED = AYAR["APP"].get("PROXY_ENABLED", True)
AVAILABILITY_CHECK = AYAR["APP"].get("AVAILABILITY_CHECK", False)
