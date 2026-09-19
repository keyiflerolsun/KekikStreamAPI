# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core import Request
from fastapi.responses import StreamingResponse
from . import api_v1_router
from ..Libs.StreamProxy import StreamProxy, json_body

_proxy = StreamProxy()


@api_v1_router.get("/stream-proxy")
async def stream_proxy(request: Request):
    token = request.query_params.get("t")
    if not token:
        return StreamingResponse(
            _error_body("missing_token"),
            status_code=400,
            media_type="application/json",
        )

    range_header = request.headers.get("range")

    result = await _proxy.open(token, range_header)

    if result.status_code in (400, 403, 502, 504):
        return StreamingResponse(
            result.body,
            status_code=result.status_code,
            media_type="application/json",
        )

    return StreamingResponse(
        result.body,
        status_code=result.status_code,
        headers=result.headers,
        media_type=result.headers.get("content-type"),
    )


async def _error_body(reason: str):
    yield json_body(reason)
