// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package handlers

import (
	"io"
	"kekik-proxy/utils"
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
	"github.com/pterm/pterm"
)

// SubtitleProxy altyazı proxy endpoint'i
func SubtitleProxy(c *gin.Context) {
	urlParam := c.Query("url")
	referer := c.Query("referer")
	userAgent := c.Query("user_agent")

	if urlParam == "" {
		c.String(http.StatusBadRequest, "URL parametresi gerekli")
		return
	}

	decodedURL, err := url.QueryUnescape(urlParam)
	if err != nil {
		c.String(http.StatusBadRequest, "Geçersiz URL")
		return
	}

	// Request headers hazırla
	reqHeaders := utils.PrepareRequestHeaders(referer, userAgent)

	// Upstream request oluştur
	req2, err := http.NewRequest("GET", decodedURL, nil)
	if err != nil {
		c.String(http.StatusBadGateway, "Request oluşturulamadı: "+err.Error())
		return
	}

	// Headers kopyala
	for k, v := range reqHeaders {
		req2.Header[k] = v
	}

	// Upstream'e istek yap
	resp, err := httpClient.Do(req2)
	if err != nil {
		pterm.Error.Printf("Upstream Error (Subtitle): %s -> %v\n", decodedURL, err)
		c.String(http.StatusBadGateway, "Proxy Error: "+err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		c.String(resp.StatusCode, "Altyazı hatası: "+resp.Status)
		return
	}

	// Body oku
	content, err := io.ReadAll(resp.Body)
	if err != nil {
		c.String(http.StatusBadGateway, "Body okuma hatası")
		return
	}

	// İçeriği işle (SRT -> VTT dönüşümü vs.)
	contentType := resp.Header.Get("Content-Type")
	processedContent := utils.ProcessSubtitleContent(content, contentType, decodedURL)

	// Response headers
	c.Header("Content-Type", "text/vtt; charset=utf-8")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Range")

	c.Data(http.StatusOK, "text/vtt", processedContent)
}
