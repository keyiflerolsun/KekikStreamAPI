// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package utils

import (
	"net/url"
	"regexp"
	"strings"
)

// RewriteHLSManifest HLS manifest içindeki göreceli URL'leri proxy URL'lerine dönüştürür
func RewriteHLSManifest(content []byte, baseURL, referer, userAgent string) []byte {
	text := string(content)

	// HLS manifest değilse değiştirme
	if !strings.HasPrefix(strings.TrimSpace(text), "#EXTM3U") {
		return content
	}

	lines := strings.Split(text, "\n")
	var newLines []string

	uriPattern := regexp.MustCompile(`URI="([^"]+)"`)

	for _, line := range lines {
		stripped := strings.TrimSpace(line)

		// URI="..." içeren satırları işle (audio/subtitle tracks)
		if strings.Contains(line, `URI="`) {
			newLine := uriPattern.ReplaceAllStringFunc(line, func(match string) string {
				submatches := uriPattern.FindStringSubmatch(match)
				if len(submatches) < 2 {
					return match
				}
				uri := submatches[1]
				absoluteURL := resolveURL(baseURL, uri)
				proxyURL := buildProxyURL(absoluteURL, referer, userAgent)
				return `URI="` + proxyURL + `"`
			})
			newLines = append(newLines, newLine)

		} else if stripped != "" && !strings.HasPrefix(stripped, "#") {
			// Segment URL satırları (# ile başlamayan ve boş olmayan)
			absoluteURL := resolveURL(baseURL, stripped)
			proxyURL := buildProxyURL(absoluteURL, referer, userAgent)
			newLines = append(newLines, proxyURL)

		} else {
			newLines = append(newLines, line)
		}
	}

	return []byte(strings.Join(newLines, "\n"))
}

// resolveURL göreceli URL'yi absolute URL'ye çevirir
func resolveURL(baseURL, relativeURL string) string {
	// Zaten absolute ise
	if strings.HasPrefix(relativeURL, "http://") || strings.HasPrefix(relativeURL, "https://") {
		return relativeURL
	}

	base, err := url.Parse(baseURL)
	if err != nil {
		return relativeURL
	}

	ref, err := url.Parse(relativeURL)
	if err != nil {
		return relativeURL
	}

	return base.ResolveReference(ref).String()
}

// buildProxyURL proxy URL'i oluşturur
func buildProxyURL(targetURL, referer, userAgent string) string {
	proxyURL := "/proxy/video?url=" + url.QueryEscape(targetURL)

	if referer != "" {
		proxyURL += "&referer=" + url.QueryEscape(referer)
	}

	if userAgent != "" {
		proxyURL += "&user_agent=" + url.QueryEscape(userAgent)
	}

	return proxyURL
}

// ProcessSubtitleContent altyazı içeriğini işler ve VTT formatına çevirir
func ProcessSubtitleContent(content []byte, contentType, urlStr string) []byte {
	// UTF-8 BOM temizliği
	if len(content) >= 3 && content[0] == 0xef && content[1] == 0xbb && content[2] == 0xbf {
		content = content[3:]
	}

	// VTT Kontrolü
	isVTT := strings.Contains(contentType, "text/vtt") || strings.HasPrefix(string(content), "WEBVTT")
	if isVTT {
		if !strings.HasPrefix(string(content), "WEBVTT") {
			return append([]byte("WEBVTT\n\n"), content...)
		}
		return content
	}

	// SRT -> VTT Dönüşümü
	text := string(content)
	isSRT := contentType == "application/x-subrip" ||
		strings.HasSuffix(strings.ToLower(urlStr), ".srt") ||
		strings.HasPrefix(strings.TrimSpace(text), "1\r\n") ||
		strings.HasPrefix(strings.TrimSpace(text), "1\n")

	if isSRT {
		// CRLF -> LF
		text = strings.ReplaceAll(text, "\r\n", "\n")
		// Zaman formatı düzeltmesi (virgül -> nokta)
		text = strings.ReplaceAll(text, ",", ".")

		if !strings.HasPrefix(text, "WEBVTT") {
			text = "WEBVTT\n\n" + text
		}
		return []byte(text)
	}

	return content
}
