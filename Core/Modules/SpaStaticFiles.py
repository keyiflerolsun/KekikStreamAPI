# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import os

from starlette.exceptions  import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles
from starlette.responses   import FileResponse


class SpaStaticFiles(StaticFiles):
    """StaticFiles serving the SPA build with index.html fallback.

    Inherits the standard static-file behaviour (correct 404s for missing
    assets, ETag/304 handling, directory redirects) and only overrides the
    final "not found" branch so that unknown non-asset routes fall back to the
    SPA entry point instead of a bare 404.
    """

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404:
                raise

        # Missing asset paths must stay 404 (the SPA never routes to them);
        # only non-asset client-side routes fall back to the index.
        if path == "assets" or path.startswith("assets/"):
            raise StarletteHTTPException(status_code=404)

        full_path = os.path.join(self.directory, "index.html")
        if os.path.isfile(full_path):
            return FileResponse(full_path)

        raise StarletteHTTPException(status_code=404)
