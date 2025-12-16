# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi  import WebSocket
from datetime import datetime
from ..Models import User, Room, ChatMessage
import json, asyncio

class WatchPartyManager:
    """Watch Party oda ve kullanıcı yönetimi"""

    def __init__(self):
        self.rooms: dict[str, Room] = {}
        self._lock = asyncio.Lock()

    async def get_room(self, room_id: str) -> Room | None:
        """Odayı getir"""
        return self.rooms.get(room_id)

    async def join_room(self, room_id: str, websocket: WebSocket, username: str, avatar: str) -> User | None:
        """Odaya katıl"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                room = Room(room_id=room_id)
                self.rooms[room_id] = room

            user = User(websocket=websocket, username=username, avatar=avatar)

            # İlk kullanıcı host olur
            if room.host_id is None:
                room.host_id = user.user_id

            room.users[user.user_id] = user
            return user

    async def leave_room(self, room_id: str, user_id: str) -> bool:
        """Odadan ayrıl"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False

            if user_id in room.users:
                del room.users[user_id]
                
                # Eğer buffer listesindeyse sil
                if user_id in room.buffering_users:
                    room.buffering_users.remove(user_id)

                # Host ayrıldıysa yeni host ata
                if room.host_id == user_id and room.users:
                    room.host_id = next(iter(room.users.keys()))

                # Oda boşsa sil
                if not room.users:
                    del self.rooms[room_id]

                return True
            return False

    async def update_video(self, room_id: str, url: str, title: str = "", video_format: str = "hls", headers: dict[str, str] = None, subtitle_url: str = "") -> bool:
        """Video URL'sini güncelle"""
        room = self.rooms.get(room_id)
        if not room:
            return False

        room.video_url    = url
        room.video_title  = title
        room.video_format = video_format
        room.subtitle_url = subtitle_url
        room.current_time = 0.0
        room.is_playing   = False
        room.updated_at   = datetime.now().timestamp()
        room.buffering_users.clear()
        if headers:
            room.headers = headers
        return True

    async def update_playback_state(self, room_id: str, is_playing: bool, current_time: float) -> bool:
        """Oynatım durumunu güncelle"""
        room = self.rooms.get(room_id)
        if not room:
            return False

        room.is_playing   = is_playing
        room.current_time = current_time
        room.updated_at   = datetime.now().timestamp()

        # Eğer manuel oynatma yapıldıysa buffer listesini temizle
        if is_playing:
            room.buffering_users.clear()

        return True

    async def set_buffering_status(self, room_id: str, user_id: str, is_buffering: bool) -> bool:
        """Kullanıcının buffering durumunu güncelle"""
        room = self.rooms.get(room_id)
        if not room:
            return False

        if is_buffering:
            room.buffering_users.add(user_id)
            # Eğer oynatılıyorsa duraklat
            if room.is_playing:
                # Odayı duraklat ama current_time'ı güncelle
                elapsed = datetime.now().timestamp() - room.updated_at
                room.current_time += elapsed
                room.is_playing = False
                room.updated_at = datetime.now().timestamp()
                return True # Durum değişti, broadcast lazım
        else:
            if user_id in room.buffering_users:
                room.buffering_users.remove(user_id)
                # Eğer kimse bufferlamıyorsa ve önceden buffer yüzünden durduysa devam et?
                # Otomatik başlatma mantığı (herkes hazırsa)
                if not room.buffering_users:
                    room.is_playing = True
                    room.updated_at = datetime.now().timestamp()
                    return True # Durum değişti

        return False

    async def handle_heartbeat(self, room_id: str, user_id: str, client_time: float):
        """Heartbeat al ve drift kontrolü yap"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return

            # Drift hesapla
            server_time = room.current_time
            if room.is_playing:
                server_time += (datetime.now().timestamp() - room.updated_at)

            drift = client_time - server_time

            # Sadece oynatılıyorsa drift düzeltmesi yap
            if not room.is_playing:
                return

            # Drift Analizi ve Düzeltme
            correction = None

            # Büyük drift (> 2 saniye): Buffer simülasyonu
            if abs(drift) > 2.0:
                correction = {
                    "type"        : "sync_correction",
                    "action"      : "buffer",
                    "target_time" : server_time,
                    "drift"       : drift
                }

            # Küçük drift (> 0.5 saniye): Hız ayarı
            # Gerideyse hızlan (1.1x), ilerideyse yavaşla (0.9x)
            elif drift < -0.5:
                correction = {
                    "type"   : "sync_correction",
                    "action" : "rate",
                    "rate"   : 1.1,
                    "drift"  : drift
                }
            elif drift > 0.5:
                correction = {
                    "type"   : "sync_correction",
                    "action" : "rate",
                    "rate"   : 0.9,
                    "drift"  : drift
                }
            # Drift yoksa (< 0.5 saniye): Normal hız
            else:
                correction = {
                    "type"   : "sync_correction",
                    "action" : "rate",
                    "rate"   : 1.0,
                    "drift"  : drift
                }

            if correction and user_id in room.users:
                try:
                    await room.users[user_id].websocket.send_text(json.dumps(correction))
                except Exception:
                    pass

    async def add_chat_message(self, room_id: str, username: str, avatar: str, message: str) -> ChatMessage | None:
        """Chat mesajı ekle"""
        room = self.rooms.get(room_id)
        if not room:
            return None

        chat_msg = ChatMessage(username=username, avatar=avatar, message=message)
        room.chat_messages.append(chat_msg)

        # Son 100 mesajı tut
        if len(room.chat_messages) > 100:
            room.chat_messages = room.chat_messages[-100:]

        return chat_msg

    async def broadcast_to_room(self, room_id: str, message: dict, exclude_user_id: str | None = None):
        """Odadaki tüm kullanıcılara mesaj gönder"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            # Sözlük değişebileceği için (async await sırasında) kopyasını al
            current_users = list(room.users.items())

        message_str = json.dumps(message, ensure_ascii=False)
        broken_connections = []

        for user_id, user in current_users:
            if exclude_user_id and user_id == exclude_user_id:
                continue
            try:
                await user.websocket.send_text(message_str)
            except Exception:
                broken_connections.append(user_id)

        # Kopmuş bağlantıları temizle
        for user_id in broken_connections:
            await self.leave_room(room_id, user_id)

    def get_room_users(self, room_id: str) -> list[dict]:
        """Odadaki kullanıcıları getir"""
        room = self.rooms.get(room_id)
        if not room:
            return []

        return [
            {
                "user_id"  : user.user_id,
                "username" : user.username,
                "avatar"   : user.avatar,
                "is_host"  : user.user_id == room.host_id
            }
            for user in room.users.values()
        ]

    def get_room_state(self, room_id: str) -> dict | None:
        """Odanın mevcut durumunu getir"""
        room = self.rooms.get(room_id)
        if not room:
            return None

        # Eğer oynatılıyorsa geçen süreyi ekle
        live_time = room.current_time
        if room.is_playing:
            elapsed = datetime.now().timestamp() - room.updated_at
            live_time += elapsed

        return {
            "room_id"       : room.room_id,
            "video_url"     : room.video_url,
            "video_title"   : room.video_title,
            "video_format"  : room.video_format,
            "subtitle_url"  : room.subtitle_url,
            "current_time"  : live_time,
            "is_playing"    : room.is_playing,
            "headers"       : room.headers,
            "users"         : self.get_room_users(room_id),
            "chat_messages" : [
                {
                    "username"  : msg.username,
                    "avatar"    : msg.avatar,
                    "message"   : msg.message,
                    "timestamp" : msg.timestamp
                }
                for msg in room.chat_messages[-50:]  # Son 50 mesaj
            ]
        }


# Singleton instance
watch_party_manager = WatchPartyManager()
