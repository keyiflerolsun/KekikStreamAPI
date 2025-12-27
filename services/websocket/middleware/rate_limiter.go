// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package middleware

import (
	"sync"
	"time"
)

// RateLimiter per-connection rate limiter
type RateLimiter struct {
	generalMsgCount int
	generalLastTime time.Time
	highMsgCount    int
	highLastTime    time.Time
	mu              sync.Mutex
}

var HighFreqOps = map[string]bool{
	"ping":         true,
	"seek":         true,
	"seek_ready":   true,
	"buffer_start": true,
	"buffer_end":   true,
}

// NewRateLimiter yeni rate limiter oluştur
func NewRateLimiter() *RateLimiter {
	now := time.Now()
	return &RateLimiter{
		generalLastTime: now,
		highLastTime:    now,
	}
}

// Check mesaj rate limit kontrolü - false dönerse limit aşılmış
func (r *RateLimiter) Check(msgType string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()

	if HighFreqOps[msgType] {
		// High Frequency Bucket (30/s)
		if now.Sub(r.highLastTime) > time.Second {
			r.highMsgCount = 0
			r.highLastTime = now
		}

		r.highMsgCount++
		return r.highMsgCount <= 30
	}

	// General Bucket (10/s)
	if now.Sub(r.generalLastTime) > time.Second {
		r.generalMsgCount = 0
		r.generalLastTime = now
	}

	r.generalMsgCount++
	return r.generalMsgCount <= 10
}
