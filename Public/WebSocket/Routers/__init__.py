# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi import APIRouter

wss_router = APIRouter(prefix="/wss")

from . import watch_party
