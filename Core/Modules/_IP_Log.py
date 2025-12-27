# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Libs import global_request

_ip_cache: dict[str, dict[str, str]] = {}

async def ip_log(hedef_ip: str) -> dict[str, str]:
    # Manuel cache - lru_cache async ile çalışmaz
    if hedef_ip in _ip_cache:
        return _ip_cache[hedef_ip]

    try:
        # Paylaşımlı GlobalClient üzerinden istek at
        response = await global_request.fetch(f"http://ip-api.com/json/{hedef_ip}", timeout=3)
        veri = response.json()

        if veri.get("status") != "fail":
            sonuc = {
                "ulke"   : veri.get("country") or "",
                "il"     : veri.get("regionName") or "",
                "ilce"   : veri.get("city") or "",
                "isp"    : veri.get("isp") or "",
                "sirket" : veri.get("org") or "",
                "host"   : veri.get("as") or ""
            }
        else:
            sonuc = {"hata": "Veri Bulunamadı.."}
    except Exception as hata:
        sonuc = {"hata": f"{type(hata).__name__} » {hata}"}

    # Cache'e ekle (max 128)
    if len(_ip_cache) >= 128:
        _ip_cache.pop(next(iter(_ip_cache)))
    _ip_cache[hedef_ip] = sonuc

    return sonuc
