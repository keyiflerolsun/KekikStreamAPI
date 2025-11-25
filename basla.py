# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI          import cikis_yap, hata_yakala
from Core         import Motor
from build_assets import minify_assets, bundle_css

if __name__ == "__main__":
    try:
        minify_assets()
        bundle_css()
        Motor.basla()
        cikis_yap(False)
    except Exception as hata:
        hata_yakala(hata)
