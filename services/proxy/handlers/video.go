// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package handlers

import (
	"io"
	"kekik-proxy/cache"
	"kekik-proxy/utils"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pterm/pterm"
)

var httpClient = &http.Client{
	Timeout: 30 * time.Second,
}

// VideoProxy video proxy endpoint'i
func VideoProxy(c *gin.Context) {
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

	// Cache kontrolü
	if cachedData, ok := cache.GlobalCache.Get(decodedURL); ok {
		pterm.Debug.Printf("Cache Hit: %s\n", decodedURL)
		c.Data(http.StatusOK, "video/mp2t", cachedData)
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

	// Range header kopyalama (Safari/iOS desteği için)
	if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
		req2.Header.Set("Range", rangeHeader)
	}

	// Headers kopyala
	for k, v := range reqHeaders {
		req2.Header[k] = v
	}

	// Upstream'e istek yap
	resp, err := httpClient.Do(req2)
	if err != nil {
		pterm.Error.Printf("Upstream Error (Video): %s -> %v\n", decodedURL, err)
		c.String(http.StatusBadGateway, "Proxy Error: "+err.Error())
		return
	}
	defer resp.Body.Close()

	// Response headers kopyala
	respHeaders := make(http.Header)
	for k, v := range resp.Header {
		if k == "Content-Type" || k == "Content-Length" || k == "Content-Range" || k == "Accept-Ranges" {
			respHeaders[k] = v
		}
	}

	// HLS segmenti ise cache'le
	if strings.HasSuffix(decodedURL, ".ts") || strings.Contains(decodedURL, "seg-") {
		body, err := io.ReadAll(resp.Body)
		if err == nil {
			cache.GlobalCache.Set(decodedURL, body)
			pterm.Debug.Printf("Cache Set: %s\n", decodedURL)
			for k, v := range respHeaders {
				c.Header(k, v[0])
			}
			c.Data(http.StatusOK, "video/mp2t", body)
			return
		}
	}

	// Response
	for k, v := range respHeaders {
		c.Header(k, v[0])
	}
	c.Status(resp.StatusCode)

	// Stream body
	c.Stream(func(w io.Writer) bool {
		buf := make([]byte, 128*1024)
		n, _ := resp.Body.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
			return true
		}
		return false
	})
}
