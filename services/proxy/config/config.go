// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port            string
	CacheSizeMB     int
	CacheTTLSeconds int
}

func Load() *Config {
	cacheSizeMB := 128
	if val := os.Getenv("CACHE_SIZE_MB"); val != "" {
		if parsed, err := strconv.Atoi(val); err == nil {
			cacheSizeMB = parsed
		}
	}

	cacheTTL := 900 // 15 dakika
	if val := os.Getenv("CACHE_TTL_SECONDS"); val != "" {
		if parsed, err := strconv.Atoi(val); err == nil {
			cacheTTL = parsed
		}
	}

	return &Config{
		Port:            "3311", // Sabit port
		CacheSizeMB:     cacheSizeMB,
		CacheTTLSeconds: cacheTTL,
	}
}
