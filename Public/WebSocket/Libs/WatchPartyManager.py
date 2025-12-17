# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi  import WebSocket
from datetime import datetime
from ..Models import User, Room, ChatMessage
import json, asyncio

class WatchPartyManager:
    """Watch Party oda ve kullanıcı yönetimi"""

    # Action öncelik sıralaması (yüksekten düşüğe)
    ACTION_PRIORITY = {
        'seek'   : 3, # En yüksek öncelik
        'pause'  : 2, # Orta öncelik
        'play'   : 1  # En düşük öncelik
    }

    def __init__(self):
        self.rooms: dict[str, Room] = {}
        self._lock = asyncio.Lock()

        # Action debounce sistemi
        self._pending_actions: dict[str, dict] = {}  # room_id -> pending action info
        self._action_timers: dict[str, asyncio.Task] = {}  # room_id -> timer task

    async def get_room(self, room_id: str) -> Room | None:
        """Odayı getir"""
        return self.rooms.get(room_id)

    async def schedule_action(self, room_id: str, action_type: str, action_data: dict, username: str):
        """Action'ı planla - eşzamanlı aksiyonları önlemek için debounce"""
        async with self._lock:
            current_action = self._pending_actions.get(room_id)

            # Eğer bekleyen aksiyon varsa, önceliğe göre karşılaştır
            if current_action:
                current_priority = self.ACTION_PRIORITY.get(current_action['type'], 0)
                new_priority     = self.ACTION_PRIORITY.get(action_type, 0)

                # Yeni aksiyon daha yüksek öncelikli veya aynı öncelikteyse, üzerine yaz
                if new_priority >= current_priority:
                    self._pending_actions[room_id] = {
                        "type"      : action_type,
                        "data"      : action_data,
                        "username"  : username,
                        "timestamp" : datetime.now().timestamp()
                    }
            else:
                # İlk aksiyon
                self._pending_actions[room_id] = {
                    "type"      : action_type,
                    "data"      : action_data,
                    "username"  : username,
                    "timestamp" : datetime.now().timestamp()
                }

            # Varsa önceki timer'ı iptal et
            if room_id in self._action_timers:
                self._action_timers[room_id].cancel()

            # 150ms debounce timer başlat
            self._action_timers[room_id] = asyncio.create_task(
                self._execute_pending_action(room_id)
            )

    async def _execute_pending_action(self, room_id: str):
        """Bekleyen aksiyonu 150ms sonra çalıştır"""
        await asyncio.sleep(0.15)  # 150ms debounce

        async with self._lock:
            if room_id not in self._pending_actions:
                return

            action_info = self._pending_actions.pop(room_id)
            self._action_timers.pop(room_id, None)

        # Action'ı çalıştır
        action_type = action_info["type"]
        action_data = action_info["data"]
        username    = action_info["username"]

        # Action tipine göre ilgili handler'ı çağır
        # Bu kısım message_handlers.py'den çağrılacak
        return {
            "action_type" : action_type,
            "action_data" : action_data,
            "username"    : username
        }

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

        return True

    async def set_buffering_status(self, room_id: str, user_id: str, is_buffering: bool) -> bool:
        """Kullanıcının buffering durumunu güncelle - sadece liste yönetimi"""
        room = self.rooms.get(room_id)
        if not room:
            return False

        if is_buffering:
            if user_id not in room.buffering_users:
                room.buffering_users.add(user_id)
                return True
        else:
            if user_id in room.buffering_users:
                room.buffering_users.remove(user_id)
                return True

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

            # Dead zone: Minimal drift ignore et (< 0.5 saniye)
            # Network jitter ve çok küçük sapmalar için düzeltme yapma
            if abs(drift) < 0.5:
                return  # Hiçbir correction gönderme

            # Büyük drift (> 3 saniye): Buffer simülasyonu
            # Sadece ciddi desenkronizasyonlarda tetikle
            if abs(drift) > 3.0:
                correction = {
                    "type"        : "sync_correction",
                    "action"      : "buffer",
                    "target_time" : server_time,
                    "drift"       : drift
                }

            # Orta drift (1.5-3.0 saniye): Orta seviye hız ayarı
            # Gerideyse hızlan (1.05x), ilerideyse yavaşla (0.95x)
            elif drift < -1.5:
                correction = {
                    "type"   : "sync_correction",
                    "action" : "rate",
                    "rate"   : 1.05,
                    "drift"  : drift
                }
            elif drift > 1.5:
                correction = {
                    "type"   : "sync_correction",
                    "action" : "rate",
                    "rate"   : 0.95,
                    "drift"  : drift
                }

            # Küçük drift (0.5-1.5 saniye): Hafif hız ayarı
            # Gerideyse hafif hızlan (1.02x), ilerideyse hafif yavaşla (0.98x)
            # Daha smooth ve fark edilmeyen düzeltme
            elif drift < -0.5:
                correction = {
                    "type"   : "sync_correction",
                    "action" : "rate",
                    "rate"   : 1.02,
                    "drift"  : drift
                }
            elif drift > 0.5:
                correction = {
                    "type"   : "sync_correction",
                    "action" : "rate",
                    "rate"   : 0.98,
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
