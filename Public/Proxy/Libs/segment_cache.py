# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from time import time
import asyncio

class SegmentCache:
    """
    LRU cache - HLS video segmentleri için
    - 128MB boyut limiti
    - En az kullanılan (LRU) segment'ler silinir
    - 15 dakika hard TTL (stream token güvenliği için)
    """

    def __init__(self, max_size_mb: int = 128, hard_ttl_seconds: int = 900):  # 900s = 15 dakika
        self.max_size_bytes   = max_size_mb * 1024 * 1024
        self.hard_ttl_seconds = hard_ttl_seconds

        # Cache storage: {url: (content, created_at, last_access, size)}
        self._cache: dict[str, tuple[bytes, float, float, int]] = {}
        self._total_size = 0
        self._lock = asyncio.Lock()

    async def get(self, url: str) -> bytes | None:
        """Cache'den segment al ve access time'ı güncelle"""
        async with self._lock:
            if url not in self._cache:
                return None

            content, created_at, _, size = self._cache[url]

            # Hard TTL kontrolü (15 dakika)
            if time() - created_at > self.hard_ttl_seconds:
                # Süresi dolmuş, sil
                del self._cache[url]
                self._total_size -= size
                return None

            # Last access time'ı güncelle (LRU için)
            self._cache[url] = (content, created_at, time(), size)

            return content

    async def set(self, url: str, content: bytes):
        """Segment'i cache'e ekle"""
        async with self._lock:
            content_size = len(content)

            # Max size kontrolü - yeni içerik çok büyükse cache'leme
            if content_size > self.max_size_bytes:
                return

            # Eğer bu URL zaten cache'deyse, önce eski boyutunu çıkar
            if url in self._cache:
                _, _, _, old_size = self._cache[url]
                self._total_size -= old_size

            # Yeni içeriği ekle (content, created_at, last_access, size)
            current_time = time()
            self._cache[url] = (content, current_time, current_time, content_size)
            self._total_size += content_size

            # LRU eviction - boyut limiti aşıldıysa en az kullanılanları sil
            await self._evict_if_needed()

    async def _evict_if_needed(self):
        """Gerekirse en az kullanılan itemları sil"""
        current_time = time()

        # Hard TTL dolmuş itemları temizle (15 dakika)
        expired_urls = [
            url for url, (_, created_at, _, _) in self._cache.items()
            if current_time - created_at > self.hard_ttl_seconds
        ]
        for url in expired_urls:
            _, _, _, size = self._cache[url]
            del self._cache[url]
            self._total_size -= size

        # Hala 128MB limiti aşılmışsa, en az kullanılan (LRU) itemları sil
        while self._total_size > self.max_size_bytes:
            if not self._cache:
                break

            # En az kullanılan item'ı bul (en küçük last_access)
            lru_url = min(self._cache.items(), key=lambda x: x[1][2])[0]  # [1][2] = last_access
            _, _, _, size = self._cache[lru_url]
            del self._cache[lru_url]
            self._total_size -= size

    def get_stats(self) -> dict:
        """Cache istatistikleri"""
        return {
            "total_items"      : len(self._cache),
            "total_size_mb"    : round(self._total_size / (1024 * 1024), 2),
            "max_size_mb"      : round(self.max_size_bytes / (1024 * 1024), 2),
            "hard_ttl_minutes" : self.hard_ttl_seconds // 60,
        }

# Global cache instance
segment_cache = SegmentCache(max_size_mb=128, hard_ttl_seconds=900)
