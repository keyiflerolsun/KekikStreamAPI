# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from .    import api_v1_router
from Core import JSONResponse

@api_v1_router.get("/health")
async def health_check():
    """API sağlık kontrolü"""
    return JSONResponse({"success": True, "status": "healthy"})
