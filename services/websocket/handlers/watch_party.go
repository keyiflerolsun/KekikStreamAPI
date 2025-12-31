// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package handlers

import (
	"encoding/json"
	"fmt"
	"kekik-websocket/manager"
	"kekik-websocket/middleware"
	"kekik-websocket/models"
	"math"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/pterm/pterm"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // CORS izin ver
	},
}

const MaxPayloadSize = 512 * 1024 // 512 KB

// WatchPartyHandler WebSocket handler
func WatchPartyHandler(c *gin.Context) {
	roomID := strings.ToUpper(c.Param("room_id"))
	if roomID == "" {
		c.String(http.StatusBadRequest, "Room ID gerekli")
		return
	}

	// WebSocket upgrade
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		pterm.Error.Printf("Upgrade Error: %s -> %v\n", roomID, err)
		return
	}
	defer conn.Close()

	pterm.Debug.Printf("Connected: %s\n", roomID)

	// Max message size
	conn.SetReadLimit(MaxPayloadSize)

	// Rate limiter
	rateLimiter := middleware.NewRateLimiter()

	// User
	var user *models.User

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg map[string]interface{}
		if err := json.Unmarshal(raw, &msg); err != nil {
			sendError(conn, "Geçersiz JSON formatı")
			continue
		}

		msgType, ok := msg["type"].(string)
		if !ok || msgType == "" {
			continue
		}

		// Rate limiting
		if !rateLimiter.Check(msgType) {
			if !middleware.HighFreqOps[msgType] {
				sendError(conn, "Çok hızlı işlem yapıyorsunuz")
			}
			continue
		}

		// Handler dispatch
		switch msgType {
		case "join":
			user = handleJoin(conn, roomID, msg)
		case "ping":
			handlePing(conn, msg)
		case "get_state":
			handleGetState(conn, roomID)
		case "play":
			if user != nil {
				handlePlay(roomID, user)
			}
		case "pause":
			if user != nil {
				handlePause(roomID, user, msg)
			}
		case "seek":
			if user != nil {
				handleSeek(roomID, user, msg)
			}
		case "seek_ready":
			if user != nil {
				handleSeekReady(roomID, user, msg)
			}
		case "chat":
			if user != nil {
				handleChat(roomID, user, msg)
			}
		case "typing":
			if user != nil {
				handleTyping(roomID, user)
			}
		case "buffer_start":
			if user != nil {
				handleBufferStart(roomID, user)
			}
		case "buffer_end":
			if user != nil {
				handleBufferEnd(roomID, user)
			}
		case "video_change":
			if user != nil {
				handleVideoChange(roomID, user, msg)
			}
		}
	}

	// Disconnect
	if user != nil {
		handleDisconnect(roomID, user)
	}
}

func sendError(conn *websocket.Conn, message string) {
	conn.WriteJSON(map[string]interface{}{
		"type":    "error",
		"message": message,
	})
}

func handleJoin(conn *websocket.Conn, roomID string, msg map[string]interface{}) *models.User {
	username, _ := msg["username"].(string)
	avatar, _ := msg["avatar"].(string)

	if username == "" {
		username = fmt.Sprintf("Misafir-%s", roomID[:4])
	}
	if avatar == "" {
		avatar = "🎬"
	}

	// User oluştur
	user := models.NewUser(conn, username, avatar)
	pterm.Debug.Printf("Joining: %s [%s]\n", username, roomID)

	room := manager.Manager.JoinRoom(roomID, user)

	// Room state gönder - Python uyumlu flat format
	state := room.GetState()
	state["type"] = "room_state"
	conn.WriteJSON(state)

	// Diğerlerine bildir
	room.Broadcast(map[string]interface{}{
		"type":     "user_joined",
		"username": username,
		"avatar":   avatar,
		"user_id":  user.UserID,
		"is_host":  user.UserID == room.HostID,
		"users":    manager.Manager.GetRoomUsers(roomID),
	}, user.UserID)

	pterm.Success.Printf("Joined: %s [%s]\n", username, roomID)
	return user
}

func handlePing(conn *websocket.Conn, msg map[string]interface{}) {
	response := map[string]interface{}{"type": "pong"}
	if pingID, ok := msg["_ping_id"]; ok {
		response["_ping_id"] = pingID
	}
	conn.WriteJSON(response)

	// Heartbeat time tracking (Python parity) - client_time loglanabilir
	if clientTime, ok := msg["current_time"].(float64); ok {
		_ = clientTime // Gelecekte drift detection için kullanılabilir
	}
}

func handleGetState(conn *websocket.Conn, roomID string) {
	room := manager.Manager.GetRoom(roomID)
	if room != nil {
		state := room.GetState()
		state["type"] = "room_state"
		conn.WriteJSON(state)
	}
}

func handlePlay(roomID string, user *models.User) {
	room := manager.Manager.GetRoom(roomID)
	if room == nil {
		return
	}

	// Zaten oynatılıyorsa ignore (Python parity)
	room.Mu.RLock()
	isPlaying := room.IsPlaying
	room.Mu.RUnlock()
	if isPlaying {
		return
	}

	// Seek-sync varsa iptal et (Python parity: cancel_seek_sync)
	room.Mu.Lock()
	if room.PauseReason == "seek" {
		room.SeekSyncWaitingUsers = make(map[string]bool)
		room.PauseReason = ""
	}
	// Buffering users temizle (Python parity: clear_buffering_users)
	room.BufferingUsers = make(map[string]bool)
	room.Mu.Unlock()

	currentTime := manager.Manager.Play(roomID)
	room.Broadcast(map[string]interface{}{
		"type":         "sync",
		"is_playing":   true,
		"current_time": currentTime,
		"force_seek":   false,
		"triggered_by": fmt.Sprintf("%s (Play)", user.Username),
	}, "")
	pterm.NewStyle(pterm.FgLightBlue).Printf("Play: %s [%s]\n", user.Username, room.RoomID)
}

func handlePause(roomID string, user *models.User, msg map[string]interface{}) {
	room := manager.Manager.GetRoom(roomID)
	if room == nil {
		return
	}

	// Seek-via-pause support (Python parity)
	if rawTime, ok := msg["time"]; ok {
		now := float64(time.Now().UnixMilli()) / 1000
		reqTime := 0.0
		switch v := rawTime.(type) {
		case float64:
			reqTime = v
		case int:
			reqTime = float64(v)
		}

		if reqTime >= 0 {
			room.Mu.RLock()
			is_playing := room.IsPlaying
			live_time := room.CurrentTime
			if is_playing {
				live_time += (now - room.UpdatedAt)
			}
			room.Mu.RUnlock()

			if is_playing && math.Abs(reqTime-live_time) > 2.0 {
				broadcastSeek(room, user, reqTime, "Seek via Pause")
				return
			}
		}
	}

	// Normal pause akışı
	// Seek-sync varsa iptal et (manuel pause override - Python paritesi)
	room.Mu.Lock()
	if room.PauseReason == "seek" {
		room.SeekSyncWaitingUsers = make(map[string]bool)
		room.PauseReason = "manual"
	}
	room.Mu.Unlock()

	currentTime := manager.Manager.Pause(roomID)
	room.Broadcast(map[string]interface{}{
		"type":         "sync",
		"is_playing":   false,
		"current_time": currentTime,
		"force_seek":   true,
		"triggered_by": user.Username,
	}, "")
	pterm.NewStyle(pterm.FgYellow).Printf("Pause: %s [%s]\n", user.Username, room.RoomID)
}

func handleSeek(roomID string, user *models.User, msg map[string]interface{}) {
	targetTime, ok := msg["time"].(float64)
	if !ok {
		return
	}

	room := manager.Manager.GetRoom(roomID)
	if room == nil {
		return
	}

	broadcastSeek(room, user, targetTime, "Seek Sync")
}

// broadcastSeek ortak seek mantığı (timeout dahil)
func broadcastSeek(room *models.Room, user *models.User, targetTime float64, triggeredText string) {
	epoch, finalTime := manager.Manager.Seek(room.RoomID, targetTime)
	if epoch <= 0 {
		return
	}

	// Seek Sync Timeout (8 saniye Python uyumlu)
	go func(rid string, e int) {
		time.Sleep(8 * time.Second)
		shouldResume, currentTime := manager.Manager.MarkSeekReady(rid, "system", e)
		if shouldResume {
			r := manager.Manager.GetRoom(rid)
			if r != nil {
				r.Broadcast(map[string]interface{}{
					"type":         "sync",
					"is_playing":   true,
					"current_time": currentTime,
					"force_seek":   true,
					"triggered_by": "System (Seek Sync Timeout)",
				}, "")
				pterm.Error.Printf("Seek Timeout: [%s] (Epoch: %d)\n", rid, e)
			}
		}
	}(room.RoomID, epoch)

	room.Broadcast(map[string]interface{}{
		"type":         "sync",
		"is_playing":   false,
		"current_time": finalTime,
		"force_seek":   true,
		"seek_sync":    true,
		"seek_epoch":   epoch,
		"triggered_by": fmt.Sprintf("%s (%s)", user.Username, triggeredText),
	}, "")
	pterm.NewStyle(pterm.FgLightMagenta).Printf("Seek: %s -> %.2f [%s] (%s)\n", user.Username, targetTime, room.RoomID, triggeredText)
}

func handleSeekReady(roomID string, user *models.User, msg map[string]interface{}) {
	epochVal, ok := msg["seek_epoch"]
	if !ok {
		return
	}
	epoch := 0
	switch v := epochVal.(type) {
	case float64:
		epoch = int(v)
	case int:
		epoch = v
	}

	pterm.Debug.Printf("Ready: %s [%s] (Epoch: %d)\n", user.Username, roomID, epoch)
	shouldResume, currentTime := manager.Manager.MarkSeekReady(roomID, user.UserID, epoch)
	if shouldResume {
		room := manager.Manager.GetRoom(roomID)
		if room != nil {
			room.Broadcast(map[string]interface{}{
				"type":         "sync",
				"is_playing":   true,
				"current_time": currentTime,
				"force_seek":   true,
				"triggered_by": "System (Seek Sync Complete)",
			}, "")
			pterm.Success.Printf("Sync Complete: [%s] (Epoch: %d)\n", room.RoomID, epoch)
		}
	}
}

func handleChat(roomID string, user *models.User, msg map[string]interface{}) {
	message, ok := msg["message"].(string)
	if !ok || strings.TrimSpace(message) == "" {
		return
	}

	chatMsg := models.NewChatMessage(user.Username, user.Avatar, message)
	manager.Manager.AddChatMessage(roomID, chatMsg)

	room := manager.Manager.GetRoom(roomID)
	if room != nil {
		room.Broadcast(map[string]interface{}{
			"type":      "chat",
			"username":  user.Username,
			"avatar":    user.Avatar,
			"message":   message,
			"timestamp": chatMsg.Timestamp,
		}, "")
	}
}

func handleTyping(roomID string, user *models.User) {
	room := manager.Manager.GetRoom(roomID)
	if room != nil {
		room.Broadcast(map[string]interface{}{
			"type":     "typing",
			"username": user.Username,
		}, user.UserID)
	}
}

func handleBufferStart(roomID string, user *models.User) {
	manager.Manager.SetBufferingStatus(roomID, user.UserID, true)
}

func handleBufferEnd(roomID string, user *models.User) {
	manager.Manager.SetBufferingStatus(roomID, user.UserID, false)
}

func handleVideoChange(roomID string, user *models.User, msg map[string]interface{}) {
	url, _ := msg["url"].(string)
	title, _ := msg["title"].(string)
	userAgent, _ := msg["user_agent"].(string)
	referer, _ := msg["referer"].(string)
	subtitleURL, _ := msg["subtitle_url"].(string)

	if url == "" {
		return
	}

	streamURL := url
	format := "hls"
	var duration float64 = 0

	// Python API'den yt-dlp ile video bilgisi al (Python parity)
	ytdlpResult := fetchYtdlpInfo(url)
	if ytdlpResult != nil {
		if su, ok := ytdlpResult["stream_url"].(string); ok && su != "" {
			streamURL = su
		}
		if t, ok := ytdlpResult["title"].(string); ok && t != "" && title == "" {
			title = t
		}
		if f, ok := ytdlpResult["format"].(string); ok && f != "" {
			format = f
		}
		if d, ok := ytdlpResult["duration"].(float64); ok {
			duration = d
		}
		if ua, ok := ytdlpResult["user_agent"].(string); ok && ua != "" && userAgent == "" {
			userAgent = ua
		}
		if ref, ok := ytdlpResult["referer"].(string); ok && ref != "" && referer == "" {
			referer = ref
		}
	} else {
		// yt-dlp başarısız, format tahmin et
		if strings.Contains(strings.ToLower(url), ".mp4") {
			format = "mp4"
		} else if strings.Contains(strings.ToLower(url), ".webm") {
			format = "webm"
		}
	}

	if title == "" {
		title = "Video"
	}

	manager.Manager.UpdateVideo(roomID, streamURL, title, format, userAgent, referer, subtitleURL, duration)

	room := manager.Manager.GetRoom(roomID)
	if room != nil {
		room.Broadcast(map[string]interface{}{
			"type":         "video_changed",
			"url":          streamURL,
			"title":        title,
			"format":       format,
			"duration":     duration,
			"user_agent":   userAgent,
			"referer":      referer,
			"subtitle_url": subtitleURL,
			"changed_by":   user.Username,
		}, "")
		pterm.Info.Printf("Video changed: %s [%s] (By: %s)\n", title, room.RoomID, user.Username)
	}
}

// fetchYtdlpInfo Python API'den yt-dlp ile video bilgisi alır
func fetchYtdlpInfo(videoURL string) map[string]interface{} {
	// Python API URL (Varsayılan: aynı Docker network'te kekik_api:3310)
	baseURL := os.Getenv("API_URL")
	if baseURL == "" {
		baseURL = "http://kekik_api:3310"
	}
	apiURL := fmt.Sprintf("%s/api/v1/ytdlp-extract?url=%s", strings.TrimSuffix(baseURL, "/"), videoURL)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		pterm.Debug.Printf("yt-dlp API error: %v\n", err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil
	}

	// result içindeki "result" objesini döndür
	if r, ok := result["result"].(map[string]interface{}); ok {
		return r
	}
	return nil
}

func handleDisconnect(roomID string, user *models.User) {
	room := manager.Manager.GetRoom(roomID)
	if room == nil {
		return
	}

	actualRoomID := room.RoomID
	manager.Manager.LeaveRoom(roomID, user.UserID)

	// Odayı tekrar al (silinmiş olabilir)
	room = manager.Manager.GetRoom(roomID)
	if room != nil {
		room.Broadcast(map[string]interface{}{
			"type":     "user_left",
			"username": user.Username,
			"user_id":  user.UserID,
			"users":    manager.Manager.GetRoomUsers(roomID),
		}, "")
	}
	pterm.Warning.Printf("Left: %s [%s]\n", user.Username, actualRoomID)
}
