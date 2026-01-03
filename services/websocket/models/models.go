// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package models

import (
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// User Watch Party kullanıcısı
type User struct {
	Conn     *websocket.Conn
	Username string
	Avatar   string
	UserID   string

	// Stall detection
	LastClientTime float64
	StallCount     int
	LastSyncTime   float64

	// Per-user buffer spam prevention
	LastBufferTriggerTime float64
	BufferTriggerCount    int
	LastRateSent          float64

	mu sync.Mutex
}

// UserSnapshot for JSON response
type UserSnapshot struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
	IsHost   bool   `json:"is_host"`
}

// NewUser yeni kullanıcı oluşturur
func NewUser(conn *websocket.Conn, username, avatar string) *User {
	return &User{
		Conn:         conn,
		Username:     username,
		Avatar:       avatar,
		UserID:       uuid.New().String()[:8],
		LastRateSent: 1.0,
	}
}

// SendJSON JSON mesaj gönderir
func (u *User) SendJSON(data interface{}) error {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.Conn.WriteJSON(data)
}

// ChatMessage chat mesajı
type ChatMessage struct {
	Username  string                 `json:"username"`
	Avatar    string                 `json:"avatar"`
	Message   string                 `json:"message"`
	Timestamp string                 `json:"timestamp"`
	ReplyTo   map[string]interface{} `json:"reply_to,omitempty"`
}

// NewChatMessage yeni chat mesajı oluşturur
func NewChatMessage(username, avatar, message string) *ChatMessage {
	return &ChatMessage{
		Username:  username,
		Avatar:    avatar,
		Message:   message,
		Timestamp: time.Now().UTC().Format(time.RFC3339), // UTC ISO format
		ReplyTo:   nil,
	}
}

// NewChatMessageWithReply yanıtlı chat mesajı oluşturur
func NewChatMessageWithReply(username, avatar, message string, replyTo map[string]interface{}) *ChatMessage {
	return &ChatMessage{
		Username:  username,
		Avatar:    avatar,
		Message:   message,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		ReplyTo:   replyTo,
	}
}

// Room Watch Party odası
type Room struct {
	RoomID        string
	VideoURL      string
	VideoTitle    string
	VideoFormat   string  // "hls" | "mp4" | "webm" | "youtube"
	VideoDuration float64 // Video süresi (saniye) - 0 = unknown
	SubtitleURL   string
	CurrentTime   float64
	IsPlaying     bool
	UserAgent     string
	Referer       string
	UpdatedAt     float64
	HostID        string

	Users          map[string]*User
	ChatMessages   []*ChatMessage
	BufferingUsers map[string]bool

	// Pause/Resume tracking
	PauseReason        string // "manual" | "buffer" | "system"
	LastAutoResumeTime float64
	LastRecoveryTime   float64
	LastPlayTime       float64
	LastPauseTime      float64
	LastSeekTime       float64

	// User-based buffer timing
	BufferStartTimeByUser map[string]float64
	BufferEndTimeByUser   map[string]float64

	// Seek-sync coordination
	SeekSyncEpoch        int
	SeekSyncWaitingUsers map[string]bool
	SeekSyncWasPlaying   bool
	SeekSyncTargetTime   float64

	Mu sync.RWMutex
}

// NewRoom yeni oda oluşturur
func NewRoom(roomID string) *Room {
	return &Room{
		RoomID:                roomID,
		VideoFormat:           "hls",
		Users:                 make(map[string]*User),
		ChatMessages:          make([]*ChatMessage, 0),
		BufferingUsers:        make(map[string]bool),
		BufferStartTimeByUser: make(map[string]float64),
		BufferEndTimeByUser:   make(map[string]float64),
		SeekSyncWaitingUsers:  make(map[string]bool),
		UpdatedAt:             float64(time.Now().UnixMilli()) / 1000,
	}
}

// AddUser odaya kullanıcı ekler
func (r *Room) AddUser(user *User) {
	r.Mu.Lock()
	defer r.Mu.Unlock()

	if r.HostID == "" {
		r.HostID = user.UserID
	}
	r.Users[user.UserID] = user
}

// RemoveUser kullanıcıyı odadan çıkarır
func (r *Room) RemoveUser(userID string) {
	r.Mu.Lock()
	defer r.Mu.Unlock()

	delete(r.Users, userID)
	delete(r.BufferingUsers, userID)
	delete(r.BufferStartTimeByUser, userID)
	delete(r.BufferEndTimeByUser, userID)
	delete(r.SeekSyncWaitingUsers, userID)
}

// GetUserCount kullanıcı sayısını döndürür
func (r *Room) GetUserCount() int {
	r.Mu.RLock()
	defer r.Mu.RUnlock()
	return len(r.Users)
}

// Broadcast tüm kullanıcılara mesaj gönderir
func (r *Room) Broadcast(data interface{}, excludeUserID string) {
	r.Mu.RLock()
	defer r.Mu.RUnlock()

	for id, user := range r.Users {
		if id != excludeUserID {
			user.SendJSON(data)
		}
	}
}

// GetState oda durumunu döndürür
func (r *Room) GetState() map[string]interface{} {
	r.Mu.RLock()
	defer r.Mu.RUnlock()

	now := float64(time.Now().UnixMilli()) / 1000
	liveTime := r.CurrentTime
	if r.IsPlaying {
		elapsed := now - r.UpdatedAt
		liveTime += elapsed
	}

	// Python like duration cap (non-HLS)
	if r.VideoDuration > 0 && r.VideoFormat != "hls" {
		safeEnd := r.VideoDuration - 0.25
		if safeEnd < 0 {
			safeEnd = 0
		}
		if liveTime > safeEnd {
			liveTime = safeEnd
		}
	}

	users := make([]UserSnapshot, 0, len(r.Users))
	for _, u := range r.Users {
		users = append(users, UserSnapshot{
			UserID:   u.UserID,
			Username: u.Username,
			Avatar:   u.Avatar,
			IsHost:   u.UserID == r.HostID,
		})
	}

	return map[string]interface{}{
		"room_id":        r.RoomID,
		"video_url":      r.VideoURL,
		"video_title":    r.VideoTitle,
		"video_format":   r.VideoFormat,
		"video_duration": r.VideoDuration,
		"subtitle_url":   r.SubtitleURL,
		"current_time":   liveTime,
		"is_playing":     r.IsPlaying,
		"user_agent":     r.UserAgent,
		"referer":        r.Referer,
		"host_id":        r.HostID,
		"users":          users,
		"chat_messages":  r.ChatMessages,
	}
}
