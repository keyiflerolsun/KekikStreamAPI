# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi            import WebSocket
from .WatchPartyManager import watch_party_manager, DEBOUNCE_WINDOW, MIN_BUFFER_DURATION
from .ytdlp_service     import ytdlp_extract_video_info
import json, time


class MessageHandler:
    """WebSocket mesaj işleyici sınıfı"""

    def __init__(self, websocket: WebSocket, room_id: str):
        self.websocket = websocket
        self.room_id   = room_id
        self.user      = None

    async def send_error(self, message: str):
        """Hata mesajı gönder"""
        await self.websocket.send_text(json.dumps({
            "type"    : "error",
            "message" : message
        }, ensure_ascii=False))

    async def send_json(self, data: dict):
        """JSON mesajı gönder"""
        await self.websocket.send_text(json.dumps(data, ensure_ascii=False))

    # ============== Handlers ==============

    async def handle_join(self, message: dict):
        """JOIN mesajını işle"""
        username = message.get("username", f"Misafir-{self.room_id[:4]}")
        avatar   = message.get("avatar", "🎬")

        self.user = await watch_party_manager.join_room(self.room_id, self.websocket, username, avatar)

        if self.user:
            room_state = await watch_party_manager.get_room_state(self.room_id)
            await self.send_json({"type": "room_state", **room_state})

            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"     : "user_joined",
                "username" : username,
                "avatar"   : avatar,
                "user_id"  : self.user.user_id,
                "users"    : await watch_party_manager.get_room_users(self.room_id)
            }, exclude_user_id=self.user.user_id)

    async def handle_play(self, message: dict):
        """PLAY mesajını işle"""
        current_time = message.get("time", 0.0)
        
        # State validation: Sadece durmuşsa play
        room = await watch_party_manager.get_room(self.room_id)
        if not room:
            return
        
        # Zaten oynuyorsa ignore et
        if room.is_playing:
            return
        
        # Manuel play yapıldığında buffer listesini temizle (atomic)
        await watch_party_manager.clear_buffering_users(self.room_id)
        
        # TÜM pending delayed pause task'larını iptal et (manuel play her şeyi override eder)
        await watch_party_manager.cancel_all_delayed_buffer_pause(self.room_id)
        
        # Play zamanını kaydet (atomic)
        await watch_party_manager.mark_play_time(self.room_id, time.perf_counter())
        
        # pause_reason temizle - atomik update_playback_state kullan
        await watch_party_manager.update_playback_state(self.room_id, True, current_time, pause_reason="")

        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"         : "sync",
            "is_playing"   : True,
            "current_time" : current_time,
            "triggered_by" : self.user.username
        }, exclude_user_id=self.user.user_id)

    async def handle_pause(self, message: dict):
        """PAUSE mesajını işle"""
        current_time = message.get("time", 0.0)

        # Atomic decision: Pause kabul edilmeli mi?
        now = time.perf_counter()
        decision = await watch_party_manager.should_accept_pause(self.room_id, now)
        
        if not decision["accept"]:
            return

        # Pause zamanını kaydet (auto-resume önleme için) - atomic
        await watch_party_manager.mark_pause_time(self.room_id, now)

        # Atomik update: is_playing=False + pause_reason="manual" tek lock'ta
        await watch_party_manager.update_playback_state(self.room_id, False, current_time, pause_reason="manual")

        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"         : "sync",
            "is_playing"   : False,
            "current_time" : current_time,
            "force_seek"   : True,
            "triggered_by" : self.user.username
        }, exclude_user_id=self.user.user_id)

    async def handle_seek(self, message: dict):
        """SEEK mesajını işle"""
        current_time = message.get("time", 0.0)
        
        # Playback snapshot'i atomic olarak al
        snapshot = await watch_party_manager.get_playback_snapshot(self.room_id)
        if not snapshot:
            return
        
        now = time.perf_counter()
        
        # Seek deduplicate: Önceki seek zamanını atomic olarak kaydet ve al
        prev_seek_time = await watch_party_manager.mark_seek_time(self.room_id, now)

        # Seek öncesi playback state'i sakla
        was_playing = snapshot["is_playing"]

        # Seek deduplicate: Aynı pozisyona çok yakın zamanda seek varsa, sadece state güncelle
        time_diff_from_last = abs(snapshot["current_time"] - current_time)
        time_since_last_seek = now - prev_seek_time  # prev_seek_time kullan
        
        # Seek sadece pozisyonu değiştirir, playback state'i korur
        await watch_party_manager.update_playback_state(self.room_id, snapshot["is_playing"], current_time)

        # Eğer başka kullanıcı aynı yere az önce seek yaptıysa, broadcast'i skip et
        should_broadcast = time_diff_from_last > 0.5 or time_since_last_seek > 0.2
        
        if should_broadcast:
            # Seek broadcast (sadece pozisyon)
            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "seek",
                "current_time" : current_time,
                "triggered_by" : self.user.username
            }, exclude_user_id=self.user.user_id)

        # Eğer oda playing durumundaysa, playback state'i sync et
        # (buffering sırasında seek yapılırsa, pause state kalıcı olmasın)
        # Sadece broadcast edildiğinde sync gönder
        if was_playing and should_broadcast:
            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "sync",
                "is_playing"   : True,
                "current_time" : current_time,
                "triggered_by" : f"{self.user.username} (Seek)"
            }, exclude_user_id=self.user.user_id)

    async def handle_chat(self, message: dict):
        """CHAT mesajını işle"""
        chat_message = message.get("message", "").strip()
        if not chat_message:
            return

        chat_msg = await watch_party_manager.add_chat_message(
            self.room_id, self.user.username, self.user.avatar, chat_message
        )

        if chat_msg:
            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"      : "chat",
                "username"  : self.user.username,
                "avatar"    : self.user.avatar,
                "message"   : chat_message,
                "timestamp" : chat_msg.timestamp
            })

    async def handle_typing(self):
        """TYPING mesajını işle - kullanıcı yazıyor"""
        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"     : "typing",
            "username" : self.user.username
        }, exclude_user_id=self.user.user_id)


    async def handle_video_change(self, message: dict):
        """VIDEO_CHANGE mesajını işle"""
        url           = message.get("url", "").strip()
        custom_title  = message.get("title", "").strip()  # Client'tan gelen title
        user_agent    = message.get("user_agent", "")
        referer       = message.get("referer", "")
        subtitle_url  = message.get("subtitle_url", "").strip()

        if not url:
            await self.send_error("Video URL'si gerekli")
            return

        video_info = await ytdlp_extract_video_info(url)

        if video_info and video_info.get("stream_url"):
            if video_info.get("http_headers"):
                h = video_info.get("http_headers")
                user_agent = h.get("user-agent") or user_agent
                referer    = h.get("referer") or referer

            # Client'tan title geldiyse onu kullan, yoksa video_info'dan al
            title = custom_title or video_info.get("title", "Video")

            await watch_party_manager.update_video(
                self.room_id,
                url          = video_info["stream_url"],
                title        = title,
                video_format = video_info.get("format", "mp4"),
                user_agent   = user_agent,
                referer      = referer,
                subtitle_url = subtitle_url,
                duration     = video_info.get("duration", 0)
            )

            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "video_changed",
                "url"          : video_info["stream_url"],
                "title"        : title,
                "format"       : video_info.get("format", "mp4"),
                "thumbnail"    : video_info.get("thumbnail"),
                "duration"     : video_info.get("duration", 0),
                "user_agent"   : user_agent,
                "referer"      : referer,
                "subtitle_url" : subtitle_url,
                "changed_by"   : self.user.username
            })
        else:
            video_format = "hls" if ".m3u8" in url.lower() else "mp4"
            title = custom_title or "Video"

            await watch_party_manager.update_video(
                self.room_id,
                url          = url,
                title        = title,
                video_format = video_format,
                user_agent   = user_agent,
                referer      = referer,
                subtitle_url = subtitle_url,
                duration     = 0  # Duration bilinmiyor
            )

            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "video_changed",
                "url"          : url,
                "title"        : title,
                "format"       : video_format,
                "user_agent"   : user_agent,
                "referer"      : referer,
                "subtitle_url" : subtitle_url,
                "changed_by"   : self.user.username
            })

    async def handle_ping(self, message: dict):
        """PING mesajını işle"""
        # Client'tan gelen _ping_id'yi geri döndür (RTT hesabı için)
        ping_id = message.get("_ping_id")
        pong_response = {"type": "pong"}
        if ping_id is not None:
            pong_response["_ping_id"] = ping_id
        
        await self.websocket.send_text(json.dumps(pong_response))

        # Her zaman current_time gönderilir (video durmuşsa bile)
        if self.user:
            client_time = message.get("current_time", 0.0)
            await watch_party_manager.handle_heartbeat(self.room_id, self.user.user_id, float(client_time))

    async def handle_buffer_start(self):
        """BUFFER_START mesajını işle"""
        now = time.perf_counter()

        # Atomic decision: Buffer start kabul edilmeli mi? (user_id eklendi)
        decision = await watch_party_manager.should_accept_buffer_start(
            self.room_id, self.user.user_id, now, DEBOUNCE_WINDOW
        )
        
        if not decision["accept"]:
            return

        # 1. İlk buffer - timestamp set et, listene ekle ama pause ETME
        if decision["is_first"]:
            await watch_party_manager.cancel_delayed_buffer_pause(self.room_id, self.user.user_id)  # Fix #7
            await watch_party_manager.mark_buffer_start_time(self.room_id, self.user.user_id, now)
            await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, True)
            return

        # 2. Seek sonrası buffer - listene ekle ama pause ETME (genelde kısa buffer)
        if decision["is_post_seek"]:
            await watch_party_manager.cancel_delayed_buffer_pause(self.room_id, self.user.user_id)  # Fix #7
            await watch_party_manager.mark_buffer_start_time(self.room_id, self.user.user_id, now)
            await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, True)
            return

        # 3. Buffer_start zamanını kaydet (user-based)
        await watch_party_manager.mark_buffer_start_time(self.room_id, self.user.user_id, now)

        # Buffering listesine ekle
        await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, True)

        # DELAYED PAUSE: 2 saniye bekle, hala buffering varsa pause et
        if decision["should_pause"]:
            await watch_party_manager.schedule_delayed_buffer_pause(
                self.room_id, self.user.user_id, self.user.username, delay=MIN_BUFFER_DURATION
            )

    async def handle_buffer_end(self):
        """BUFFER_END mesajını işle"""
        now = time.perf_counter()
        
        # Delayed pause task'ını iptal et (kısa buffer olduğu için pause gerekmez)
        await watch_party_manager.cancel_delayed_buffer_pause(self.room_id, self.user.user_id)
        
        # Atomic buffer_end + auto-resume check
        result = await watch_party_manager.buffer_end_and_check_resume(
            self.room_id, self.user.user_id, now, MIN_BUFFER_DURATION, DEBOUNCE_WINDOW
        )
        
        if not result:
            return
        
        # Auto-resume gerekiyorsa broadcast
        if result["should_resume"]:
            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "sync",
                "is_playing"   : True,
                "current_time" : result["current_time"],
                "triggered_by" : "System (Buffering Complete)"
            })

    async def handle_get_state(self):
        """GET_STATE mesajını işle"""
        room_state = await watch_party_manager.get_room_state(self.room_id)
        if room_state:
            await self.send_json({"type": "room_state", **room_state})

    async def handle_disconnect(self):
        """Kullanıcı bağlantısı koptuğunda çağrılır"""
        if not self.user:
            return

        username = self.user.username
        user_id  = self.user.user_id

        await watch_party_manager.leave_room(self.room_id, user_id)

        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"     : "user_left",
            "username" : username,
            "user_id"  : user_id,
            "users"    : await watch_party_manager.get_room_users(self.room_id)
        })
