# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI        import konsol
from fastapi    import FastAPI
from contextlib import asynccontextmanager
from curl_cffi  import AsyncSession
from Settings   import AVAILABILITY_CHECK
from Public.API.v1.Libs import plugin_manager
import asyncio

# Maksimum eş zamanlı kontrol sayısı
MAX_CONCURRENT_CHECKS = 10

async def _check_plugin(name: str, sem: asyncio.Semaphore, lock: asyncio.Lock) -> None:
    """Her eklenti için ayrı bir AsyncSession açıp ana sayfayı kontrol eder.

    Erişim sağlanamazsa eklentiyi kapatır ve yöneticiden kaldırır. Sem ve lock
    kullanılarak eşzamanlı bağlantı sayısı sınırlandırılır ve plugin listesi güvenli
    şekilde güncellenir.
    """
    try:
        plugin = plugin_manager.select_plugin(name)
    except Exception:
        # Eklenti listeden kaldırılmış veya seçilemiyorsa artık kontrol gerekmez
        return

    # Kapasite sınırı: aynı anda en fazla `MAX_CONCURRENT_CHECKS` oturum açılacak
    async with sem:
        try:
            async with AsyncSession(impersonate="chrome", timeout=15) as oturum:
                istek = await oturum.get(plugin.main_url)
                if istek.status_code != 200:
                    try:
                        await plugin.close()
                    except Exception:
                        pass
                    async with lock:
                        plugin_manager.plugins.pop(name, None)
                    konsol.log(f"[red]Eklentiye erişilemiyor : {plugin.name} | {plugin.main_url}")
        except Exception:
            # Hata durumunda eklentiyi kapat ve kaldır
            try:
                await plugin.close()
            except Exception:
                pass
            async with lock:
                plugin_manager.plugins.pop(name, None)
            konsol.log(f"[red]Eklentiye erişilemiyor : {plugin.name} | {plugin.main_url}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan events - startup ve shutdown"""

    # ! Eğer eklenti ana sayfası erişilemiyorsa atla
    if AVAILABILITY_CHECK:
        sem  = asyncio.Semaphore(MAX_CONCURRENT_CHECKS)
        lock = asyncio.Lock()

        plugin_names = list(plugin_manager.get_plugin_names())

        async with asyncio.TaskGroup() as tg:
            for name in plugin_names:
                tg.create_task(_check_plugin(name, sem, lock))

        konsol.log(f"[green]Eklenti erişim kontrolleri tamamlandı. (maks {MAX_CONCURRENT_CHECKS} eşzamanlı)")

    yield
