# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from __future__   import annotations
from CLI          import konsol
from urllib.parse import urlparse
import httpx, asyncio

class RequestLimiter:
    """
    Global ve domain bazlı rate limiting (Semaphore) yönetimi.
    Kontrollü concurrency sağlayarak ban/retry riskini azaltır.
    """
    def __init__(self, global_limit: int = 200, domain_limit: int = 50):
        self.global_semaphore = asyncio.Semaphore(global_limit)
        self.domain_semaphores: dict[str, asyncio.Semaphore] = {}
        self.domain_limit = domain_limit
        self._lock        = asyncio.Lock()

    async def get_domain_semaphore(self, domain: str) -> asyncio.Semaphore:
        async with self._lock:
            if domain not in self.domain_semaphores:
                self.domain_semaphores[domain] = asyncio.Semaphore(self.domain_limit)
            return self.domain_semaphores[domain]

class GlobalClient:
    """
    Optimize edilmiş httpx.AsyncClient singleton yapısı.
    HTTP/2, connection pooling ve reuse sağlar.
    """
    _instance : 'GlobalClient'    | None = None
    _client   : httpx.AsyncClient | None = None
    _limiter  : RequestLimiter    | None = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GlobalClient, cls).__new__(cls)
        return cls._instance

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("GlobalClient henüz başlatılmadı! lifespan içinde 'start()' çağrılmalı.")
        return self._client

    @property
    def limiter(self) -> RequestLimiter:
        if self._limiter is None:
            self._limiter = RequestLimiter()
        return self._limiter

    async def start(self):
        """Client'ı ilklendir (FastAPI startup'ta çağrılmalı)"""
        if self._client is not None:
            return

        limits = httpx.Limits(
            max_connections           = 200,
            max_keepalive_connections = 50,
            keepalive_expiry          = 30.0
        )
        timeout = httpx.Timeout(
            connect = 5.0,
            read    = 20.0,
            write   = 10.0,
            pool    = 5.0
        )

        self._client = httpx.AsyncClient(
            http2            = True,
            headers          = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"},
            limits           = limits,
            timeout          = timeout,
            follow_redirects = True
        )
        # konsol.log("[bold green]🚀 GlobalClient başlatıldı (HTTP/2 + Pooling)[/]")

    async def stop(self):
        """Client'ı kapat (FastAPI shutdown'da çağrılmalı)"""
        if self._client:
            await self._client.aclose()
            self._client = None
            # konsol.log("[bold yellow]🛑 GlobalClient kapatıldı[/]")

    async def fetch(self, url: str, method: str = "GET", **kwargs) -> httpx.Response:
        """
        Paylaşımlı client ve limiter ile istek atar.
        """
        domain = urlparse(url).netloc

        domain_sem = await self.limiter.get_domain_semaphore(domain)

        async with self.limiter.global_semaphore:
            async with domain_sem:
                return await self.client.request(method, url, **kwargs)

# Singleton instance
global_request = GlobalClient()
