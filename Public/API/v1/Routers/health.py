# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core import JSONResponse
from .    import api_v1_router

@api_v1_router.get("/health")
async def health_check():
    """API sağlık kontrolü"""
    return JSONResponse({"success": True, "status": "healthy"})
