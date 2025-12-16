# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI        import konsol
from fastapi    import FastAPI
from contextlib import asynccontextmanager
from curl_cffi  import AsyncSession
from Settings   import AVAILABILITY_CHECK
from Public.API.v1.Libs import plugin_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan events - startup ve shutdown"""

    # ! Eğer eklenti ana sayfası erişilemiyorsa atla
    if AVAILABILITY_CHECK:
        async with AsyncSession(impersonate="chrome", timeout=3) as oturum:
            for name in plugin_manager.get_plugin_names():
                plugin = plugin_manager.select_plugin(name)
                try:
                    istek = await oturum.get(plugin.main_url)
                    if istek.status_code != 200:
                        await plugin.close()
                        plugin_manager.plugins.pop(name)
                        konsol.log(f"[red]Eklentiye erişilemiyor : {plugin.name} | {plugin.main_url}")
                except Exception:
                    await plugin.close()
                    plugin_manager.plugins.pop(name)
                    konsol.log(f"[red]Eklentiye erişilemiyor : {plugin.name} | {plugin.main_url}")

        konsol.log(f"[green]Eklenti erişim kontrolleri tamamlandı.")

    yield
