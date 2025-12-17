# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi            import WebSocket
from .WatchPartyManager import watch_party_manager
from .ytdlp_service     import ytdlp_extract_video_info
from datetime           import datetime
import json

# ============== Timing Constants (seconds) ==============
DEBOUNCE_WINDOW = 1.0       # Genel debounce penceresi (tüm race condition'lar için)
MIN_BUFFER_DURATION = 2.0   # Minimum buffer süresi (kısa buffer'ları ignore)

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
        }))

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
            room_state = watch_party_manager.get_room_state(self.room_id)
            await self.send_json({"type": "room_state", **room_state})

            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"     : "user_joined",
                "username" : username,
                "avatar"   : avatar,
                "user_id"  : self.user.user_id,
                "users"    : watch_party_manager.get_room_users(self.room_id)
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
        
        # Manuel play yapıldığında buffer listesini temizle
        room.buffering_users.clear()
        
        # Play zamanını kaydet
        room.last_play_time = datetime.now().timestamp()
        
        await watch_party_manager.update_playback_state(self.room_id, True, current_time)

        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"         : "sync",
            "is_playing"   : True,
            "current_time" : current_time,
            "triggered_by" : self.user.username
        }, exclude_user_id=self.user.user_id)

    async def handle_pause(self, message: dict):
        """PAUSE mesajını işle"""
        current_time = message.get("time", 0.0)

        # State validation: Sadece oynuyorsa pause
        room = await watch_party_manager.get_room(self.room_id)
        if not room:
            return

        # Zaten durmuşsa ignore et
        if not room.is_playing:
            return

        # Debounce kontrolü - tek timestamp ile
        now = datetime.now().timestamp()
        
        if now - room.last_play_time < DEBOUNCE_WINDOW:
            return
        
        if now - room.last_buffer_end_time < DEBOUNCE_WINDOW:
            return
        
        if now - room.last_auto_resume_time < DEBOUNCE_WINDOW:
            return
        
        # Buffering kaynaklı pause'u ignore et (network latency dahil)
        if now - room.last_buffer_start_time < DEBOUNCE_WINDOW:
            return

        # Pause zamanını kaydet (auto-resume önleme için)
        room.last_pause_time = now

        await watch_party_manager.update_playback_state(self.room_id, False, current_time)

        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"         : "sync",
            "is_playing"   : False,
            "current_time" : current_time,
            "force_seek"   : True,  # Pause durumunda kesin sync için
            "triggered_by" : self.user.username
        }, exclude_user_id=self.user.user_id)

    async def handle_seek(self, message: dict):
        """SEEK mesajını işle"""
        current_time = message.get("time", 0.0)
        room = await watch_party_manager.get_room(self.room_id)
        if room:
            # Seek zamanını kaydet (post-seek buffer ignore için)
            room.last_seek_time = datetime.now().timestamp()

            # Seek öncesi playback state'i sakla
            was_playing = room.is_playing

            # Seek sadece pozisyonu değiştirir, playback state'i korur
            await watch_party_manager.update_playback_state(self.room_id, room.is_playing, current_time)

            # Seek broadcast (sadece pozisyon)
            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "seek",
                "current_time" : current_time,
                "triggered_by" : self.user.username
            }, exclude_user_id=self.user.user_id)

            # Eğer oda playing durumundaysa, playback state'i sync et
            # (buffering sırasında seek yapılırsa, pause state kalıcı olmasın)
            if was_playing:
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

        headers = {}
        if user_agent:
            headers["User-Agent"] = user_agent
        if referer:
            headers["Referer"] = referer

        video_info = await ytdlp_extract_video_info(url)

        if video_info and video_info.get("stream_url"):
            if video_info.get("http_headers"):
                headers.update(video_info.get("http_headers"))

            # Client'tan title geldiyse onu kullan, yoksa video_info'dan al
            title = custom_title or video_info.get("title", "Video")

            await watch_party_manager.update_video(
                self.room_id,
                url          = video_info["stream_url"],
                title        = title,
                video_format = video_info.get("format", "mp4"),
                headers      = headers,
                subtitle_url = subtitle_url
            )

            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "video_changed",
                "url"          : video_info["stream_url"],
                "title"        : title,
                "format"       : video_info.get("format", "mp4"),
                "thumbnail"    : video_info.get("thumbnail"),
                "duration"     : video_info.get("duration", 0),
                "headers"      : headers,
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
                headers      = headers,
                subtitle_url = subtitle_url
            )

            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "video_changed",
                "url"          : url,
                "title"        : title,
                "format"       : video_format,
                "headers"      : headers,
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
        room = await watch_party_manager.get_room(self.room_id)
        if not room:
            return

        now = datetime.now().timestamp()

        # 1. İlk buffer kontrolü: Initialization buffer - ignore
        if room.last_buffer_start_time == 0.0:
            room.last_buffer_start_time = now
            await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, True)
            return

        # 2. Seek sonrası buffer - ignore (post-seek buffer gereksiz pause yaratır)
        if now - room.last_seek_time < DEBOUNCE_WINDOW:
            await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, True)
            return

        # 3. Minimum buffer threshold - kısa buffer'ları ignore et
        if now - room.last_buffer_start_time < MIN_BUFFER_DURATION:
            await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, True)
            return

        # Buffer_start zamanını kaydet
        room.last_buffer_start_time = now

        # Eğer video oynatılıyorsa önce durdur
        was_playing = room.is_playing
        if was_playing:
            # Current time'ı güncelle (video oynarken geçen süreyi ekle)
            elapsed = now - room.updated_at
            current_time = room.current_time + elapsed

            await watch_party_manager.update_playback_state(self.room_id, False, current_time)

            # Buffering listesine ekle
            await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, True)

            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "sync",
                "is_playing"   : False,
                "current_time" : current_time,
                "triggered_by" : f"{self.user.username} (Buffering...)"
            })
        else:
            # Sadece listeye ekle
            await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, True)

    async def handle_buffer_end(self):
        """BUFFER_END mesajını işle"""
        room = await watch_party_manager.get_room(self.room_id)
        if not room:
            return

        now = datetime.now().timestamp()
        
        # Buffer_end zamanını kaydet
        room.last_buffer_end_time = now

        await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, False)

        # Auto-resume kontrolü
        # ÖNEMLI: Manuel pause sonrası auto-resume yapma
        # NOT: Seek kontrolü YOK - seek video durdurmaz, sadece pozisyon değiştirir
        if now - room.last_pause_time < DEBOUNCE_WINDOW:
            return
        
        if not room.buffering_users and not room.is_playing:
            # Auto-resume zamanını kaydet
            room.last_auto_resume_time = now

            await watch_party_manager.update_playback_state(self.room_id, True, room.current_time)

            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "sync",
                "is_playing"   : True,
                "current_time" : room.current_time,
                "triggered_by" : "System (Buffering Complete)"
            })

    async def handle_get_state(self):
        """GET_STATE mesajını işle"""
        room_state = watch_party_manager.get_room_state(self.room_id)
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
            "users"    : watch_party_manager.get_room_users(self.room_id)
        })
