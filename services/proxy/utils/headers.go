// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package utils

import (
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
)

const (
	DefaultUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5)"
	DefaultReferer   = "https://twitter.com/"
)

var ContentTypes = map[string]string{
	".m3u8": "application/vnd.apple.mpegurl",
	".ts":   "video/mp2t",
	".mp4":  "video/mp4",
	".webm": "video/webm",
	".mkv":  "video/x-matroska",
	".m4s":  "video/iso.segment",
	".png":  "image/png",
}

var CORSHeaders = map[string]string{
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "Origin, Content-Type, Accept, Range",
}

// GetContentType URL ve response headers'dan content-type belirle
func GetContentType(urlStr string, responseHeaders http.Header) string {
	// 1. Response header kontrolü
	if ct := responseHeaders.Get("Content-Type"); ct != "" {
		return ct
	}

	// 2. URL uzantısı kontrolü
	urlLower := strings.ToLower(urlStr)
	for ext, ct := range ContentTypes {
		if strings.Contains(urlLower, ext) {
			return ct
		}
	}

	// 3. Varsayılan
	return "video/mp4"
}

// PrepareRequestHeaders proxy isteği için headerları hazırlar
func PrepareRequestHeaders(referer, userAgent string) http.Header {
	headers := make(http.Header)

	headers.Set("Accept", "*/*")
	headers.Set("Accept-Encoding", "identity")
	headers.Set("Connection", "keep-alive")

	if userAgent != "" && userAgent != "None" {
		headers.Set("User-Agent", userAgent)
	} else {
		headers.Set("User-Agent", DefaultUserAgent)
	}

	if referer != "" && referer != "None" {
		decoded, err := url.QueryUnescape(referer)
		if err == nil {
			headers.Set("Referer", decoded)
		} else {
			headers.Set("Referer", referer)
		}
	}

	return headers
}

// PrepareResponseHeaders client'a dönecek headerları hazırlar
func PrepareResponseHeaders(responseHeaders http.Header, urlStr string, detectedContentType string) http.Header {
	headers := make(http.Header)

	// CORS headers
	for k, v := range CORSHeaders {
		headers.Set(k, v)
	}

	// Content-Type belirle
	if detectedContentType != "" {
		headers.Set("Content-Type", detectedContentType)
	} else {
		headers.Set("Content-Type", GetContentType(urlStr, responseHeaders))
	}

	// Transfer edilecek headerlar
	importantHeaders := []string{
		"Content-Range", "Accept-Ranges",
		"Etag", "Cache-Control", "Content-Disposition",
		"Content-Length",
	}

	for _, h := range importantHeaders {
		if val := responseHeaders.Get(h); val != "" {
			headers.Set(h, val)
		}
	}

	// Zorunlu headerlar
	if headers.Get("Accept-Ranges") == "" {
		headers.Set("Accept-Ranges", "bytes")
	}

	return headers
}

// DetectHLSFromURL URL yapısından HLS olup olmadığını tahmin eder
func DetectHLSFromURL(urlStr string) bool {
	indicators := []string{".m3u8", "/m.php", "/l.php", "/ld.php", "master.txt", "embed/sheila"}
	for _, indicator := range indicators {
		if strings.Contains(urlStr, indicator) {
			return true
		}
	}
	return false
}

// IsHLSSegment URL'nin HLS segment'i olup olmadığını kontrol et
func IsHLSSegment(urlStr string) bool {
	urlLower := strings.ToLower(urlStr)

	// Manifest'leri hariç tut
	if strings.Contains(urlLower, ".m3u8") {
		return false
	}

	// Segment göstergeleri
	segmentIndicators := []string{".ts", ".m4s", "seg-", "chunk-", "fragment", ".png"}
	for _, indicator := range segmentIndicators {
		if strings.Contains(urlLower, indicator) {
			return true
		}
	}
	return false
}

// GetFilenameFromURL URL'den dosya adını çıkar
func GetFilenameFromURL(urlStr string) string {
	u, err := url.Parse(urlStr)
	if err != nil {
		return ""
	}
	return filepath.Base(u.Path)
}
