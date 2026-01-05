// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package main

import (
	"fmt"
	"kekik-websocket/config"
	"kekik-websocket/handlers"
	"kekik-websocket/manager"
	"kekik-websocket/middleware"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pterm/pterm"
)

func main() {
	cfg := config.Load()

	// Gin mode
	gin.SetMode(gin.ReleaseMode)

	// RoomManager cleanup ticker'ı başlat
	manager.Manager.StartCleanupTicker()

	// PTerm Debug Messages
	pterm.EnableDebugMessages()

	// Router oluştur
	r := gin.New() // default logger'ı devre dışı bırakmak için gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.CustomGinLogger())

	// CORS Middleware (health check için gerekli)
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Accept")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}

		c.Next()
	})

	// Health check
	healthHandler := func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "kekik-websocket",
		})
	}
	r.GET("/health", healthHandler)
	r.HEAD("/health", healthHandler)

	// WebSocket endpoint
	r.GET("/wss/watch_party/:room_id", handlers.WatchPartyHandler)

	// Server başlat
	addr := fmt.Sprintf(":%s", cfg.Port)

	// Boxed Service Configuration with Title
	pterm.DefaultBox.WithTitle(pterm.LightMagenta("KEKIK WEBSOCKET")).WithTitleBottomRight().Printf(
		"🚀 %s: %s\n📦 %s: %s\n🔧 %s: %s",
		pterm.LightCyan("Address"), pterm.White(addr),
		pterm.LightGreen("Service"), pterm.White("kekik-websocket"),
		pterm.LightMagenta("Mode"), pterm.White("Gin Release"),
	)
	fmt.Println() // Boşluk

	if err := r.Run(addr); err != nil {
		pterm.Error.Printf("Server hatası: %v\n", err)
	}
}
