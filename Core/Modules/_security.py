# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core import kekik_FastAPI, Request

@kekik_FastAPI.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)

    # --- Temel Güvenlik Başlıkları ---
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"]        = "SAMEORIGIN"              # Rich Snippet'ler için uygun
    response.headers["X-XSS-Protection"]       = "0"                       # Modern tarayıcılarda devre dışı bırak (CSP ile korunuyor)
    response.headers["Referrer-Policy"]        = "strict-origin-when-cross-origin"

    # --- Modern Tarayıcı / İzolasyon Politikaları ---
    response.headers["Cross-Origin-Opener-Policy"]   = "same-origin"
    # response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"

    # --- HTTPS Zorlaması (HSTS) ---
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

    # --- Permissions-Policy (Feature-Policy) ---
    # Permissions-Policy: sadece bilinen ve stabil feature'lar kısıtlanıyor
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=(), "
        "fullscreen=(self)"
    )

    # Admin ve özel rotaları gizle
    if request.url.path.startswith(("/admin", "/api")):
        response.headers["X-Robots-Tag"] = "noindex, nofollow"

    # --- Gereksiz Bilgi Sızmalarını Temizle ---
    for header in ("server", "x-powered-by"):
        if header in response.headers:
            del response.headers[header]

    return response
