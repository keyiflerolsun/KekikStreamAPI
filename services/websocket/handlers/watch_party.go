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
	"net/url"
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
			if user != nil {
				sendError(user, "Geçersiz JSON formatı")
			} else {
				sendErrorToConn(conn, "Geçersiz JSON formatı")
			}
			continue
		}

		msgType, ok := msg["type"].(string)
		if !ok || msgType == "" {
			continue
		}

		// Rate limiting
		if !rateLimiter.Check(msgType) {
			if !middleware.HighFreqOps[msgType] {
				if user != nil {
					sendError(user, "Çok hızlı işlem yapıyorsunuz")
				} else {
					sendErrorToConn(conn, "Çok hızlı işlem yapıyorsunuz")
				}
			}
			continue
		}

		// Handler dispatch
		switch msgType {
		case "join":
			user = handleJoin(conn, roomID, msg)
		case "ping":
			if user != nil {
				handlePing(conn, roomID, user, msg)
			}
		case "get_state":
			handleGetState(user, roomID)
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

func sendErrorToConn(conn *websocket.Conn, message string) {
	// join öncesi user yokken mecbur
	conn.SetWriteDeadline(time.Now().Add(1 * time.Second))
	_ = conn.WriteJSON(map[string]interface{}{
		"type":    "error",
		"message": message,
	})
}

func sendError(user *models.User, message string) {
	if user == nil {
		return
	}
	_ = user.SendJSON(map[string]interface{}{
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
	_ = user.SendJSON(state)

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

func handlePing(conn *websocket.Conn, roomID string, user *models.User, msg map[string]interface{}) {
	response := map[string]interface{}{"type": "pong"}
	if pingID, ok := msg["_ping_id"]; ok {
		// Ping ID'yi int'e çevir (JS Number uyumluluğu için)
		switch v := pingID.(type) {
		case float64:
			response["_ping_id"] = int(v)
		case int:
			response["_ping_id"] = v
		default:
			response["_ping_id"] = pingID
		}
	}
	// Pong gönder - user varsa mutex ile, yoksa deadline ile
	if user != nil {
		_ = user.SendJSON(response)
	} else {
		conn.SetWriteDeadline(time.Now().Add(1 * time.Second))
		_ = conn.WriteJSON(response)
	}

	// Soft sync: client_time varsa drift hesapla ve gerekirse playbackRate düzelt
	if clientTime, ok := msg["current_time"].(float64); ok && user != nil {
		// syncing flag: client senkronizasyon sırasındaysa drift/stall hesaplamalarını skip et
		isSyncing := false
		if s, ok := msg["syncing"].(bool); ok {
			isSyncing = s
		}
		if !isSyncing {
			checkSoftSync(roomID, user, clientTime)
		} else {
			// Syncing modunda sadece stall counter'ları resetle
			user.LastClientTime = clientTime
			user.StallCount = 0
		}
	} else if user != nil {
		// current_time yoksa da stall counter'ları resetle
		user.StallCount = 0
	}
}

// checkSoftSync küçük drift'lerde playbackRate ile yumuşak senkronizasyon sağlar
// Geride olan hızlanır (1.03x), ilerde olan yavaşlar (0.97x)
// Büyük drift (>3s) veya stall durumunda hard sync tetikler
func checkSoftSync(roomID string, user *models.User, clientTime float64) {
	room := manager.Manager.GetRoom(roomID)
	if room == nil {
		return
	}

	now := float64(time.Now().UnixMilli()) / 1000

	room.Mu.RLock()
	isPlaying := room.IsPlaying
	roomCurrentTime := room.CurrentTime
	roomUpdatedAt := room.UpdatedAt
	pauseReason := room.PauseReason
	lastSeekTime := room.LastSeekTime
	lastRecoveryTime := room.LastRecoveryTime
	videoDuration := room.VideoDuration
	videoFormat := room.VideoFormat
	room.Mu.RUnlock()

	// Seek barrier aktifken soft sync yapma (zaten hard sync koordinasyonu var)
	if pauseReason == "seek" {
		return
	}

	// Video oynatılmıyorsa soft sync yapma
	if !isPlaying {
		// Ama rate'i 1.0'a resetle
		if user.LastRateSent != 1.0 {
			user.LastRateSent = 1.0
			_ = user.SendJSON(map[string]interface{}{
				"type": "sync_correction",
				"rate": 1.0,
			})
		}
		return
	}

	// Seek sonrası 1sn drift ignore (debounce)
	if now-lastSeekTime < 1.0 {
		user.LastClientTime = clientTime
		user.StallCount = 0
		return
	}

	// Stall detection (client time ilerlemiyor)
	if math.Abs(clientTime-user.LastClientTime) < 0.05 {
		user.StallCount++
	} else {
		user.StallCount = 0
	}
	user.LastClientTime = clientTime

	// Server time hesapla
	serverTime := roomCurrentTime + (now - roomUpdatedAt)
	drift := clientTime - serverTime

	// ============== HARD SYNC (>2s drift veya stall) ==============
	// Mobil ve web client'lar 1-1.5s'de hazır oluyor, 2s yeterli
	needHardSync := (user.StallCount >= 2 && (now-user.LastSyncTime) > 2.0) ||
		(math.Abs(drift) > 2.0 && (now-user.LastSyncTime) > 2.0)

	if needHardSync {
		user.LastSyncTime = now
		user.LastRateSent = 1.0 // Hard sync sonrası rate reset
		user.StallCount = 0

		// Room recovery time güncelle (lock ile)
		room.Mu.Lock()
		room.LastRecoveryTime = now
		room.LastAutoResumeTime = now
		room.Mu.Unlock()

		_ = user.SendJSON(map[string]interface{}{
			"type":         "sync",
			"is_playing":   true,
			"current_time": serverTime,
			"force_seek":   true,
			"triggered_by": "System (Heartbeat Sync)",
		})
		pterm.Debug.Printf("Hard Sync: %s -> %.2f [%s]\n", user.Username, serverTime, roomID)
		return
	}

	// ============== SOFT SYNC (0.5s - 2.0s drift) ==============
	// Rate limit: 2 saniyede bir kontrol (daha reaktif)
	if now-user.LastSyncTime < 2.0 {
		return
	}

	// Recovery sonrası 2sn içinde soft sync yapma
	if now-lastRecoveryTime < 2.0 {
		return
	}

	// VOD end guard: non-HLS + sona yakın (önceki 0.5s) correction yapma (spam önleme)
	if videoFormat != "hls" && videoDuration >= 1.0 && serverTime >= videoDuration-0.5 {
		return
	}

	var rate float64 = 1.0

	// Soft sync: 0.5s - 3.0s arası drift için playbackRate ayarla
	if drift > 0.5 {
		rate = 0.97 // Client ilerde, yavaşlat
	} else if drift < -0.5 {
		rate = 1.03 // Client geride, hızlandır
	}

	// Büyük drift (>2s) için soft sync yapma (hard sync devreye girecek)
	if math.Abs(drift) > 2.0 {
		return
	}

	// Rate değişmediyse veya zaten aynı rate gönderilmişse skip
	if rate == user.LastRateSent {
		return
	}

	// Rate gönder
	user.LastSyncTime = now
	user.LastRateSent = rate
	_ = user.SendJSON(map[string]interface{}{
		"type": "sync_correction",
		"rate": rate,
	})
}

func handleGetState(user *models.User, roomID string) {
	if user == nil {
		return
	}
	room := manager.Manager.GetRoom(roomID)
	if room != nil {
		state := room.GetState()
		state["type"] = "room_state"
		_ = user.SendJSON(state)
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

	// Rate reset - Manager.Play sonrası oda kilitlenip kullanıcılar güncellenir
	room.Mu.Lock()
	for _, u := range room.Users {
		u.LastRateSent = 1.0
	}
	room.Mu.Unlock()

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

		if reqTime >= 0 && !math.IsNaN(reqTime) {
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
	// Her türlü hard sync durumunda kullanıcıların LastRateSent durumunu sıfırla
	for _, u := range room.Users {
		u.LastRateSent = 1.0
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

	// Seek Sync Timeout (5 saniye - mobil daha hızlı hazır oluyor)
	go func(rid string, e int) {
		time.Sleep(5 * time.Second)
		shouldResume, currentTime := manager.Manager.MarkSeekReady(rid, "system", e)
		if shouldResume {
			r := manager.Manager.GetRoom(rid)
			if r != nil {
				// Rate reset
				r.Mu.Lock()
				for _, u := range r.Users {
					u.LastRateSent = 1.0
				}
				r.Mu.Unlock()

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

	// Rate reset
	room.Mu.Lock()
	for _, u := range room.Users {
		u.LastRateSent = 1.0
	}
	room.Mu.Unlock()

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
			// Rate reset
			room.Mu.Lock()
			for _, u := range room.Users {
				u.LastRateSent = 1.0
			}
			room.Mu.Unlock()

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

	// Reply bilgisini al (opsiyonel)
	replyTo, _ := msg["reply_to"].(map[string]interface{})

	var chatMsg *models.ChatMessage
	if replyTo != nil {
		chatMsg = models.NewChatMessageWithReply(user.Username, user.Avatar, message, replyTo)
	} else {
		chatMsg = models.NewChatMessage(user.Username, user.Avatar, message)
	}
	manager.Manager.AddChatMessage(roomID, chatMsg)

	room := manager.Manager.GetRoom(roomID)
	if room != nil {
		broadcastData := map[string]interface{}{
			"type":      "chat",
			"username":  user.Username,
			"avatar":    user.Avatar,
			"message":   message,
			"timestamp": chatMsg.Timestamp,
		}

		// Reply bilgisi varsa ekle
		if replyTo != nil {
			broadcastData["reply_to"] = replyTo
		}

		room.Broadcast(broadcastData, "")
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
	// Per-user buffer spam prevention (30s'de 3+ trigger ignore)
	now := float64(time.Now().UnixMilli()) / 1000
	timeSinceLastBuffer := now - user.LastBufferTriggerTime

	if timeSinceLastBuffer < 30.0 {
		user.BufferTriggerCount++
	} else {
		user.BufferTriggerCount = 1
	}
	user.LastBufferTriggerTime = now

	// 30 saniyede 3+ kez buffer tetiklediyse ignore et
	if user.BufferTriggerCount > 3 {
		return
	}

	room := manager.Manager.GetRoom(roomID)
	if room == nil {
		return
	}

	// Buffer start zamanını kaydet
	room.Mu.Lock()
	room.BufferStartTimeByUser[user.UserID] = now
	room.Mu.Unlock()

	manager.Manager.SetBufferingStatus(roomID, user.UserID, true)

	// Delayed buffer pause: 2 saniye bekle, hala buffering varsa odayı pause'a al
	go func(rid string, uid string, startTime float64) {
		time.Sleep(2 * time.Second)

		r := manager.Manager.GetRoom(rid)
		if r == nil {
			return
		}

		// Lock al, state güncelle
		r.Mu.Lock()

		// Bu kullanıcı hala buffering mi?
		if !r.BufferingUsers[uid] {
			r.Mu.Unlock()
			return
		}

		// Buffer start zamanı değişmediyse (aynı buffer event)
		if r.BufferStartTimeByUser[uid] != startTime {
			r.Mu.Unlock()
			return
		}

		// Oda zaten pause'da ise veya seek barrier aktifse skip
		if !r.IsPlaying || r.PauseReason == "seek" {
			r.Mu.Unlock()
			return
		}

		// Buffer pause uygula
		now := float64(time.Now().UnixMilli()) / 1000
		elapsed := now - r.UpdatedAt
		r.CurrentTime += elapsed
		r.IsPlaying = false
		r.UpdatedAt = now
		r.LastPauseTime = now
		r.PauseReason = "buffer"
		currentTime := r.CurrentTime

		// Her türlü hard sync durumunda kullanıcıların LastRateSent durumunu sıfırla
		for _, u := range r.Users {
			u.LastRateSent = 1.0
		}

		pterm.Debug.Printf("Buffer Pause: %s triggered [%s]\n", uid, rid)

		// Lock'u bırak, sonra broadcast yap (yavaş client'lar diğer işlemleri bloklamasın)
		r.Mu.Unlock()

		// Broadcast: buffer pause
		r.Broadcast(map[string]interface{}{
			"type":         "sync",
			"is_playing":   false,
			"current_time": currentTime,
			"force_seek":   false,
			"triggered_by": "System (Buffer Pause)",
		}, "")
	}(roomID, user.UserID, now)
}

func handleBufferEnd(roomID string, user *models.User) {
	now := float64(time.Now().UnixMilli()) / 1000

	room := manager.Manager.GetRoom(roomID)
	if room == nil {
		manager.Manager.SetBufferingStatus(roomID, user.UserID, false)
		return
	}

	// Buffer end zamanını kaydet
	room.Mu.Lock()
	room.BufferEndTimeByUser[user.UserID] = now
	room.Mu.Unlock()

	manager.Manager.SetBufferingStatus(roomID, user.UserID, false)

	// Auto resume: Buffer pause durumunda ve hiç buffering kullanıcı kalmadıysa
	room.Mu.Lock()

	// Buffer pause değilse skip
	if room.PauseReason != "buffer" {
		room.Mu.Unlock()
		return
	}

	// Hala buffering yapan var mı?
	if len(room.BufferingUsers) > 0 {
		room.Mu.Unlock()
		return
	}

	// Auto resume çok sık olmasın (3s rate limit)
	if now-room.LastAutoResumeTime < 3.0 {
		room.Mu.Unlock()
		return
	}

	// Auto resume uygula
	room.IsPlaying = true
	room.UpdatedAt = now
	room.LastAutoResumeTime = now
	room.PauseReason = ""
	currentTime := room.CurrentTime

	// Her türlü hard sync durumunda kullanıcıların LastRateSent durumunu sıfırla
	for _, u := range room.Users {
		u.LastRateSent = 1.0
	}

	pterm.Debug.Printf("Auto Resume: all buffers cleared [%s]\n", roomID)

	// Lock'u bırak, sonra broadcast yap
	room.Mu.Unlock()

	// Broadcast: auto resume
	room.Broadcast(map[string]interface{}{
		"type":         "sync",
		"is_playing":   true,
		"current_time": currentTime,
		"force_seek":   false,
		"triggered_by": "System (Auto Resume)",
	}, "")
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
	apiURL := fmt.Sprintf("%s/api/v1/ytdlp-extract?url=%s", strings.TrimSuffix(baseURL, "/"), url.QueryEscape(videoURL))

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
