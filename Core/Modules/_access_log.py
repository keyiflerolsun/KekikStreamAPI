# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import logging

# Uvicorn'un varsayılan erişim günlüğü tam istek satırını yazar, ör.
# `GET /api/v1/stream-proxy?t=<token> 200`. Token base64 çözülünce upstream yayın
# URL'si + referer ortaya çıktığı için bu satır stderr/systemd journal'a sızmamalıdır.
# Aşağıdaki filtre stream-proxy isteklerini erişim günlüğünden düşürür; diğer tüm
# rotaların erişim günlüğü aynen korunur.
class StreamProxyErisimLoguGizle(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/stream-proxy" not in record.getMessage()


def erisim_logu_gizle():
    "uvicorn.access logger'ına stream-proxy filtrelemesini (idempotent) takar."

    erisim = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, StreamProxyErisimLoguGizle) for f in erisim.filters):
        erisim.addFilter(StreamProxyErisimLoguGizle())
