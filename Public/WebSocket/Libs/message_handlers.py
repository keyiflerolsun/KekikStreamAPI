# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi            import WebSocket
from .WatchPartyManager import watch_party_manager
from .ytdlp_service     import ytdlp_extract_video_info
import json

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
        await watch_party_manager.update_playback_state(self.room_id, False, current_time)

        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"         : "sync",
            "is_playing"   : False,
            "current_time" : current_time,
            "triggered_by" : self.user.username
        }, exclude_user_id=self.user.user_id)

    async def handle_seek(self, message: dict):
        """SEEK mesajını işle"""
        current_time = message.get("time", 0.0)
        room = await watch_party_manager.get_room(self.room_id)
        if room:
            await watch_party_manager.update_playback_state(self.room_id, room.is_playing, current_time)

            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "seek",
                "current_time" : current_time,
                "is_playing"   : room.is_playing,
                "triggered_by" : self.user.username
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
        await self.websocket.send_text(json.dumps({"type": "pong"}))

        if self.user:
            client_time = message.get("current_time")
            if client_time is not None:
                await watch_party_manager.handle_heartbeat(self.room_id, self.user.user_id, float(client_time))

    async def handle_buffer_start(self):
        """BUFFER_START mesajını işle"""
        changed = await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, True)
        if changed:
            room_state = watch_party_manager.get_room_state(self.room_id)
            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "sync",
                "is_playing"   : False,
                "current_time" : room_state["current_time"],
                "triggered_by" : f"{self.user.username} (Buffering...)"
            })

    async def handle_buffer_end(self):
        """BUFFER_END mesajını işle"""
        changed = await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, False)
        if changed:
            room = await watch_party_manager.get_room(self.room_id)
            if room and not room.buffering_users and not room.is_playing:
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
