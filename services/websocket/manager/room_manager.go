// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package manager

import (
	"kekik-websocket/models"
	"sync"
	"sync/atomic"
	"time"
)

// RoomManager oda yönetici
type RoomManager struct {
	rooms       map[string]*models.Room
	mu          sync.RWMutex
	cleanupOnce sync.Once
}

// Global instance
var Manager = &RoomManager{
	rooms: make(map[string]*models.Room),
}

// StartCleanupTicker periyodik temizlik başlatır (dead users & empty rooms)
func (m *RoomManager) StartCleanupTicker() {
	m.cleanupOnce.Do(func() {
		ticker := time.NewTicker(30 * time.Second)
		go func() {
			for range ticker.C {
				m.cleanup()
			}
		}()
	})
}

func (m *RoomManager) cleanup() {
	m.mu.Lock()
	roomIDs := make([]string, 0, len(m.rooms))
	for id := range m.rooms {
		roomIDs = append(roomIDs, id)
	}
	m.mu.Unlock()

	for _, rid := range roomIDs {
		room := m.GetRoom(rid)
		if room == nil {
			continue
		}

		// Dead user'ları tespit et ve snapshot al (lock içinde)
		room.Mu.Lock()
		deadUserSnapshots := make([]models.UserSnapshot, 0)
		for _, user := range room.Users {
			if atomic.LoadInt64(&user.LastSendFailedAt) > 0 {
				deadUserSnapshots = append(deadUserSnapshots, models.UserSnapshot{
					UserID:   user.UserID,
					Username: user.Username,
					Avatar:   user.Avatar,
				})
			}
		}

		// Dead user'ları temizle ve host re-election yap
		for _, snap := range deadUserSnapshots {
			delete(room.Users, snap.UserID)
			delete(room.BufferingUsers, snap.UserID)
			delete(room.BufferStartTimeByUser, snap.UserID)
			delete(room.BufferEndTimeByUser, snap.UserID)
			delete(room.SeekSyncWaitingUsers, snap.UserID)

			// Boşalan koltuğu doldur (host re-election)
			if room.HostID == snap.UserID {
				room.HostID = ""
			}
		}

		// Eğer host boş kaldıysa ama hala içeride birileri varsa yeni host seç
		if room.HostID == "" && len(room.Users) > 0 {
			for uid := range room.Users {
				room.HostID = uid
				break
			}
		}

		userCount := len(room.Users)

		// Snapshot users in map format (client expectations parity + avoid deadlock)
		usersList := make([]map[string]interface{}, 0, len(room.Users))
		for _, u := range room.Users {
			usersList = append(usersList, map[string]interface{}{
				"user_id":  u.UserID,
				"username": u.Username,
				"avatar":   u.Avatar,
				"is_host":  u.UserID == room.HostID,
			})
		}
		room.Mu.Unlock()

		// Silinen her kullanıcı için odaya haber ver (lock dışında)
		for _, snap := range deadUserSnapshots {
			room.Broadcast(map[string]interface{}{
				"type":     "user_left",
				"user_id":  snap.UserID,
				"username": snap.Username,
				"users":    usersList,
			}, "")
		}

		// Oda boşsa (veya sadece dead user'lar vardıysa) sil
		if userCount == 0 {
			m.RemoveRoom(rid)
		}
	}
}

// GetOrCreateRoom odayı al veya oluştur
func (m *RoomManager) GetOrCreateRoom(roomID string) *models.Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	if room, ok := m.rooms[roomID]; ok {
		return room
	}

	room := models.NewRoom(roomID)
	m.rooms[roomID] = room
	return room
}

// GetRoom odayı al
func (m *RoomManager) GetRoom(roomID string) *models.Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[roomID]
}

// RemoveRoom odayı sil
func (m *RoomManager) RemoveRoom(roomID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rooms, roomID)
}

// JoinRoom kullanıcıyı odaya ekle
func (m *RoomManager) JoinRoom(roomID string, user *models.User) *models.Room {
	room := m.GetOrCreateRoom(roomID)
	room.AddUser(user)
	return room
}

// LeaveRoom kullanıcıyı odadan çıkar
func (m *RoomManager) LeaveRoom(roomID, userID string) {
	room := m.GetRoom(roomID)
	if room == nil {
		return
	}

	room.RemoveUser(userID)

	// Oda boşsa sil
	if room.GetUserCount() == 0 {
		m.RemoveRoom(roomID)
	}
}

// Play odada play başlat
func (m *RoomManager) Play(roomID string) float64 {
	room := m.GetRoom(roomID)
	if room == nil {
		return 0
	}

	room.Mu.Lock()
	defer room.Mu.Unlock()

	if room.IsPlaying {
		return room.CurrentTime
	}

	now := float64(time.Now().UnixMilli()) / 1000
	room.IsPlaying = true
	room.UpdatedAt = now
	room.LastPlayTime = now
	room.PauseReason = ""

	// Buffering users temizle
	room.BufferingUsers = make(map[string]bool)

	return room.CurrentTime
}

// Pause odada pause
func (m *RoomManager) Pause(roomID string) float64 {
	room := m.GetRoom(roomID)
	if room == nil {
		return 0
	}

	room.Mu.Lock()
	defer room.Mu.Unlock()

	now := float64(time.Now().UnixMilli()) / 1000

	// Playing ise current time güncelle
	if room.IsPlaying {
		elapsed := now - room.UpdatedAt
		room.CurrentTime += elapsed
	}

	room.IsPlaying = false
	room.UpdatedAt = now
	room.LastPauseTime = now
	room.PauseReason = "manual"

	return room.CurrentTime
}

// Seek odada seek
func (m *RoomManager) Seek(roomID string, targetTime float64) (int, float64) {
	room := m.GetRoom(roomID)
	if room == nil {
		return 0, 0
	}

	room.Mu.Lock()
	defer room.Mu.Unlock()

	now := float64(time.Now().UnixMilli()) / 1000

	// Non-HLS duration clamp (Python parity)
	clampedTime := targetTime
	if room.VideoDuration > 0 && room.VideoFormat != "hls" {
		safeEnd := room.VideoDuration - 0.25
		if safeEnd < 0 {
			safeEnd = 0
		}
		if clampedTime > safeEnd {
			clampedTime = safeEnd
		}
	}
	if clampedTime < 0 {
		clampedTime = 0
	}

	// Seek epoch artır
	room.SeekSyncEpoch++
	epoch := room.SeekSyncEpoch

	// Waiting users oluştur
	room.SeekSyncWaitingUsers = make(map[string]bool)
	for userID := range room.Users {
		room.SeekSyncWaitingUsers[userID] = true
	}

	// SeekSyncWasPlaying durumunu koru (barrier varken üst üste seek gelirse asıl durumu unutmamak için)
	if room.PauseReason != "seek" {
		room.SeekSyncWasPlaying = room.IsPlaying
	}
	room.SeekSyncTargetTime = clampedTime

	// Pause state'e geç
	room.IsPlaying = false
	room.CurrentTime = clampedTime
	room.UpdatedAt = now
	room.LastSeekTime = now
	room.PauseReason = "seek"

	return epoch, clampedTime
}

// MarkSeekReady kullanıcı seek sync'e hazır
func (m *RoomManager) MarkSeekReady(roomID, userID string, epoch int) (bool, float64) {
	room := m.GetRoom(roomID)
	if room == nil {
		return false, 0
	}

	room.Mu.Lock()
	defer room.Mu.Unlock()

	// Epoch kontrolü
	if epoch != room.SeekSyncEpoch {
		return false, 0
	}

	// Kullanıcıyı hazır olarak işaretle
	if userID == "system" {
		room.SeekSyncWaitingUsers = make(map[string]bool)
	} else {
		delete(room.SeekSyncWaitingUsers, userID)
	}

	// Herkes hazır mı?
	if len(room.SeekSyncWaitingUsers) == 0 && room.SeekSyncWasPlaying {
		now := float64(time.Now().UnixMilli()) / 1000
		room.IsPlaying = true
		room.UpdatedAt = now
		room.PauseReason = ""
		// SeekSyncWasPlaying'i sıfırla (timeout'un tekrar tetiklenmesini önle)
		room.SeekSyncWasPlaying = false
		// Epoch'u artır (timeout goroutine epoch kontrolünde fail olsun)
		room.SeekSyncEpoch++
		return true, room.CurrentTime
	}

	return false, 0
}

// UpdateVideo video bilgilerini güncelle
func (m *RoomManager) UpdateVideo(roomID, url, title, format, userAgent, referer, subtitleURL string, duration float64) {
	room := m.GetRoom(roomID)
	if room == nil {
		return
	}

	room.Mu.Lock()
	defer room.Mu.Unlock()

	room.VideoURL = url
	room.VideoTitle = title
	room.VideoFormat = format
	room.VideoDuration = duration
	room.UserAgent = userAgent
	room.Referer = referer
	room.SubtitleURL = subtitleURL
	room.CurrentTime = 0
	room.IsPlaying = false
	room.UpdatedAt = float64(time.Now().UnixMilli()) / 1000
}

// AddChatMessage chat mesajı ekle
func (m *RoomManager) AddChatMessage(roomID string, msg *models.ChatMessage) {
	room := m.GetRoom(roomID)
	if room == nil {
		return
	}

	room.Mu.Lock()
	defer room.Mu.Unlock()

	room.ChatMessages = append(room.ChatMessages, msg)

	// Max 100 mesaj tut
	if len(room.ChatMessages) > 100 {
		room.ChatMessages = room.ChatMessages[len(room.ChatMessages)-100:]
	}
}

// SetBufferingStatus buffering durumunu güncelle
func (m *RoomManager) SetBufferingStatus(roomID, userID string, isBuffering bool) {
	room := m.GetRoom(roomID)
	if room == nil {
		return
	}

	room.Mu.Lock()
	defer room.Mu.Unlock()

	if isBuffering {
		room.BufferingUsers[userID] = true
	} else {
		delete(room.BufferingUsers, userID)
	}
}

// GetRoomUsers oda kullanıcılarını al
func (m *RoomManager) GetRoomUsers(roomID string) []map[string]interface{} {
	room := m.GetRoom(roomID)
	if room == nil {
		return nil
	}

	room.Mu.RLock()
	defer room.Mu.RUnlock()

	users := make([]map[string]interface{}, 0, len(room.Users))
	for _, u := range room.Users {
		users = append(users, map[string]interface{}{
			"user_id":  u.UserID,
			"username": u.Username,
			"avatar":   u.Avatar,
			"is_host":  u.UserID == room.HostID,
		})
	}
	return users
}
