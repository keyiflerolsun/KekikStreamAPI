// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package cache

import (
	"sync"
	"time"
)

type cacheEntry struct {
	content    []byte
	createdAt  time.Time
	lastAccess time.Time
	size       int
}

// SegmentCache LRU cache - HLS video segmentleri için
// - Yapılandırılabilir boyut limiti (varsayılan 128MB)
// - En az kullanılan (LRU) segment'ler silinir
// - Hard TTL (varsayılan 15 dakika)
type SegmentCache struct {
	maxSizeBytes   int
	hardTTLSeconds int
	cache          map[string]*cacheEntry
	totalSize      int
	mu             sync.RWMutex
}

// NewSegmentCache yeni bir segment cache oluşturur
func NewSegmentCache(maxSizeMB, hardTTLSeconds int) *SegmentCache {
	return &SegmentCache{
		maxSizeBytes:   maxSizeMB * 1024 * 1024,
		hardTTLSeconds: hardTTLSeconds,
		cache:          make(map[string]*cacheEntry),
	}
}

// Get cache'den segment al
func (c *SegmentCache) Get(url string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, exists := c.cache[url]
	if !exists {
		return nil, false
	}

	// Hard TTL kontrolü
	if time.Since(entry.createdAt) > time.Duration(c.hardTTLSeconds)*time.Second {
		c.totalSize -= entry.size
		delete(c.cache, url)
		return nil, false
	}

	// Last access güncelle (LRU için)
	entry.lastAccess = time.Now()
	return entry.content, true
}

// Set segment'i cache'e ekle
func (c *SegmentCache) Set(url string, content []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()

	contentSize := len(content)

	// Max size kontrolü - yeni içerik çok büyükse cache'leme
	if contentSize > c.maxSizeBytes {
		return
	}

	// Eğer bu URL zaten cache'deyse, önce eski boyutunu çıkar
	if existing, ok := c.cache[url]; ok {
		c.totalSize -= existing.size
	}

	// Yeni içeriği ekle
	now := time.Now()
	c.cache[url] = &cacheEntry{
		content:    content,
		createdAt:  now,
		lastAccess: now,
		size:       contentSize,
	}
	c.totalSize += contentSize

	// LRU eviction
	c.evictIfNeeded()
}

func (c *SegmentCache) evictIfNeeded() {
	now := time.Now()

	// Hard TTL dolmuş itemları temizle
	for url, entry := range c.cache {
		if now.Sub(entry.createdAt) > time.Duration(c.hardTTLSeconds)*time.Second {
			c.totalSize -= entry.size
			delete(c.cache, url)
		}
	}

	// Hala limit aşılmışsa, LRU itemları sil
	for c.totalSize > c.maxSizeBytes && len(c.cache) > 0 {
		var lruURL string
		var lruTime time.Time
		first := true

		for url, entry := range c.cache {
			if first || entry.lastAccess.Before(lruTime) {
				lruURL = url
				lruTime = entry.lastAccess
				first = false
			}
		}

		if lruURL != "" {
			c.totalSize -= c.cache[lruURL].size
			delete(c.cache, lruURL)
		}
	}
}

// Stats cache istatistikleri
func (c *SegmentCache) Stats() map[string]interface{} {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return map[string]interface{}{
		"total_items":      len(c.cache),
		"total_size_mb":    float64(c.totalSize) / (1024 * 1024),
		"max_size_mb":      float64(c.maxSizeBytes) / (1024 * 1024),
		"hard_ttl_minutes": c.hardTTLSeconds / 60,
	}
}

// Global cache instance (main.go'da başlatılacak)
var GlobalCache *SegmentCache

func InitGlobalCache(maxSizeMB, hardTTLSeconds int) {
	GlobalCache = NewSegmentCache(maxSizeMB, hardTTLSeconds)
}
