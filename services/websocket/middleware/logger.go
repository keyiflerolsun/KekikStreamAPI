// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package middleware

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pterm/pterm"
)

// CustomGinLogger PTerm tabanlı estetik Gin loglayıcı
func CustomGinLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		method := c.Request.Method

		// Renk ve ikon belirle
		var statusPrinter *pterm.PrefixPrinter
		switch {
		case status >= 200 && status < 300:
			statusPrinter = &pterm.Success
		case status >= 400 && status < 500:
			statusPrinter = &pterm.Warning
		default:
			statusPrinter = &pterm.Error
		}

		// Metod rengi
		methodColor := pterm.LightMagenta
		switch method {
		case "GET":
			methodColor = pterm.LightCyan
		case "POST":
			methodColor = pterm.LightGreen
		case "PUT":
			methodColor = pterm.Yellow
		case "DELETE":
			methodColor = pterm.Red
		}

		fullPath := path
		if query != "" {
			fullPath = fmt.Sprintf("%s?%s", path, query)
		}

		// Log formatı: [TIME] STATUS METHOD LATENCY PATH
		statusPrinter.Printf("%s %s %v %s\n",
			methodColor(method),
			pterm.White(status),
			pterm.LightBlue(latency.Round(time.Millisecond)),
			pterm.Gray(fullPath),
		)
	}
}
