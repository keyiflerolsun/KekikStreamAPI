# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from curl_cffi import AsyncSession

_ip_cache: dict[str, dict[str, str]] = {}

async def ip_log(hedef_ip: str) -> dict[str, str]:
    # Manuel cache - lru_cache async ile çalışmaz
    if hedef_ip in _ip_cache:
        return _ip_cache[hedef_ip]

    try:
        async with AsyncSession(timeout=3) as oturum:
            istek = await oturum.get(f"http://ip-api.com/json/{hedef_ip}")
            veri  = istek.json()

            if veri["status"] != "fail":
                sonuc = {
                    "ulke"   : veri["country"] or "",
                    "il"     : veri["regionName"] or "",
                    "ilce"   : veri["city"] or "",
                    "isp"    : veri["isp"] or "",
                    "sirket" : veri["org"] or "",
                    "host"   : veri["as"] or ""
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
