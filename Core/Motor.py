# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI      import konsol
from Settings import AYAR, HOST, PORT
from sys      import version_info
import uvicorn, subprocess

def basla():
    surum = f"{version_info[0]}.{version_info[1]}"
    konsol.print(f"\n[bold gold1]{AYAR['PROJE']}[/] [yellow]:bird:[/] [turquoise2]Python {surum}[/] [bold yellow2]uvicorn[/]", width=70, justify="center")
    konsol.print(f"[red]{HOST}[light_coral]:[/]{PORT}[pale_green1] başlatılmıştır...[/]\n", width=70, justify="center")

    uvicorn.run("Core:kekik_FastAPI", host=HOST, port=PORT, proxy_headers=True, forwarded_allow_ips="*", workers=1, log_level="error")

    # komut = [
    #     "gunicorn",
    #     "-k", "uvicorn.workers.UvicornWorker",
    #     "Core:kekik_FastAPI",
    #     "--log-level", "error",
    #     "--bind", f"{HOST}:{PORT}",
    #     "--workers", "2",
    #     "--keep-alive", "5",
    #     "--worker-tmp-dir", "/dev/shm",
    #     "--max-requests", "10000", "--max-requests-jitter", "1000"
    # ]

    # subprocess.run(komut, check=True)
