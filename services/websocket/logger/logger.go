// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package logger

import (
	"fmt"
	"time"

	"github.com/fatih/color"
)

var (
	infoColor    = color.New(color.FgCyan, color.Bold)
	successColor = color.New(color.FgGreen, color.Bold)
	warnColor    = color.New(color.FgYellow, color.Bold)
	errorColor   = color.New(color.FgRed, color.Bold)
	debugColor   = color.New(color.FgMagenta)
	timeColor    = color.New(color.FgWhite, color.Faint)
)

func timestamp() string {
	return timeColor.Sprintf("[%s]", time.Now().Format("15:04:05"))
}

// Info bilgi logu
func Info(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s %s %s\n", timestamp(), infoColor.Sprint("ℹ️  INFO"), msg)
}

// Success başarı logu
func Success(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s %s %s\n", timestamp(), successColor.Sprint("✅ SUCCESS"), msg)
}

// Warn uyarı logu
func Warn(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s %s %s\n", timestamp(), warnColor.Sprint("⚠️  WARN"), msg)
}

// Error hata logu
func Error(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s %s %s\n", timestamp(), errorColor.Sprint("❌ ERROR"), msg)
}

// Debug debug logu
func Debug(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("%s %s %s\n", timestamp(), debugColor.Sprint("🔍 DEBUG"), msg)
}

// Request HTTP request logu
func Request(method, path string, status int) {
	statusColor := successColor
	if status >= 400 {
		statusColor = errorColor
	} else if status >= 300 {
		statusColor = warnColor
	}
	fmt.Printf("%s %s %s %s %s\n",
		timestamp(),
		infoColor.Sprint("→"),
		color.New(color.FgBlue, color.Bold).Sprint(method),
		path,
		statusColor.Sprintf("[%d]", status),
	)
}

// WS WebSocket logu
func WS(roomID, event, username string) {
	fmt.Printf("%s %s %s %s %s\n",
		timestamp(),
		color.New(color.FgMagenta, color.Bold).Sprint("🔌 WS"),
		color.New(color.FgCyan).Sprintf("[%s]", roomID),
		color.New(color.FgYellow).Sprint(event),
		color.New(color.FgGreen).Sprint(username),
	)
}

// WSError WebSocket hata logu
func WSError(roomID, event string, err error) {
	fmt.Printf("%s %s %s %s %s\n",
		timestamp(),
		errorColor.Sprint("🔌 WS ERROR"),
		color.New(color.FgCyan).Sprintf("[%s]", roomID),
		color.New(color.FgYellow).Sprint(event),
		errorColor.Sprint(err.Error()),
	)
}

// Startup servis başlangıç logu
func Startup(serviceName, port string) {
	fmt.Println()
	successColor.Printf("🚀 %s başlatıldı\n", serviceName)
	infoColor.Printf("   📡 Port: %s\n", port)
	fmt.Println()
}

// CacheHit cache hit logu
func CacheHit(url string) {
	short := url
	if len(url) > 60 {
		short = "..." + url[len(url)-57:]
	}
	fmt.Printf("%s %s %s\n", timestamp(), successColor.Sprint("💾 CACHE HIT"), short)
}

// CacheMiss cache miss logu
func CacheMiss(url string, sizeKB int) {
	short := url
	if len(url) > 50 {
		short = "..." + url[len(url)-47:]
	}
	fmt.Printf("%s %s %s %s\n",
		timestamp(),
		warnColor.Sprint("💾 CACHE MISS"),
		short,
		debugColor.Sprintf("(%dKB)", sizeKB),
	)
}
