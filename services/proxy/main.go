// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package main

import (
	"fmt"
	"kekik-proxy/cache"
	"kekik-proxy/config"
	"kekik-proxy/handlers"
	"kekik-proxy/middleware"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pterm/pterm"
)

func main() {
	cfg := config.Load()

	// Global cache başlat
	cache.InitGlobalCache(cfg.CacheSizeMB, cfg.CacheTTLSeconds)

	// Gin mode
	gin.SetMode(gin.ReleaseMode)

	// Router oluştur
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.CustomGinLogger())

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Range")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}

		c.Next()
	})

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":      "healthy",
			"service":     "kekik-proxy",
			"cache_stats": cache.GlobalCache.Stats(),
		})
	})

	// Proxy endpoints
	proxy := r.Group("/proxy")
	{
		proxy.GET("/video", handlers.VideoProxy)
		proxy.HEAD("/video", handlers.VideoProxy)
		proxy.GET("/subtitle", handlers.SubtitleProxy)
	}

	// Server başlat
	addr := fmt.Sprintf(":%s", cfg.Port)

	// Boxed Service Configuration with Top-Left Title
	pterm.DefaultBox.WithTitle(pterm.LightCyan("KEKIK PROXY")).WithTitleBottomRight().Printf(
		"🚀 %s: %s\n📦 %s: %s\n🔧 %s: %s\n💾 %s: %dMB (TTL: %d s)",
		pterm.LightCyan("Address"), pterm.White(addr),
		pterm.LightGreen("Service"), pterm.White("kekik-proxy"),
		pterm.LightMagenta("Mode"), pterm.White("Gin Release"),
		pterm.LightBlue("Cache"), cfg.CacheSizeMB, cfg.CacheTTLSeconds,
	)
	fmt.Println() // Boşluk

	if err := r.Run(addr); err != nil {
		pterm.Error.Printf("Server hatası: %v\n", err)
	}
}
