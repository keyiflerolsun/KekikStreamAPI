# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi    import FastAPI
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan events - startup ve shutdown"""

    yield
