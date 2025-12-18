# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi  import WebSocket
from ..Models import User, Room, ChatMessage
import json, asyncio, time

# ============== Timing Constants (seconds) ==============
DEBOUNCE_WINDOW = 1.0       # Genel debounce penceresi (tüm race condition'lar için)
MIN_BUFFER_DURATION = 2.0   # Minimum buffer süresi (kısa buffer'ları ignore)

class WatchPartyManager:
    """Watch Party oda ve kullanıcı yönetimi"""

    # Action öncelik sıralaması (yüksekten düşüğe)
    ACTION_PRIORITY = {
        "seek"   : 3, # En yüksek öncelik
        "pause"  : 2, # Orta öncelik
        "play"   : 1  # En düşük öncelik
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
                        "timestamp" : time.perf_counter()
                    }
            else:
                # İlk aksiyon
                self._pending_actions[room_id] = {
                    "type"      : action_type,
                    "data"      : action_data,
                    "username"  : username,
                    "timestamp" : time.perf_counter()
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

                # Task cleanup (pending delayed pause varsa iptal et)
                task = room.pending_buffer_pause_tasks.pop(user_id, None)
                if task and not task.done():
                    task.cancel()

                # Epoch tracking cleanup
                room.buffer_pause_epoch_by_user.pop(user_id, None)

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
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False

            room.video_url    = url
            room.video_title  = title
            room.video_format = video_format
            room.subtitle_url = subtitle_url
            room.current_time = 0.0
            room.is_playing   = False
            room.updated_at   = time.perf_counter()
            room.buffering_users.clear()
            if headers:
                room.headers = headers
            return True

    async def update_playback_state(self, room_id: str, is_playing: bool, current_time: float) -> bool:
        """Oynatım durumunu güncelle"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False

            room.is_playing   = is_playing
            room.current_time = current_time
            room.updated_at   = time.perf_counter()

            return True

    async def set_buffering_status(self, room_id: str, user_id: str, is_buffering: bool) -> bool:
        """Kullanıcının buffering durumunu güncelle - sadece liste yönetimi"""
        async with self._lock:
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

    async def mark_play_time(self, room_id: str, timestamp: float) -> bool:
        """Play zamanını atomik olarak kaydet"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False
            room.last_play_time = timestamp
            return True

    async def mark_pause_time(self, room_id: str, timestamp: float) -> bool:
        """Pause zamanını atomik olarak kaydet"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False
            room.last_pause_time = timestamp
            return True

    async def mark_seek_time(self, room_id: str, timestamp: float) -> float:
        """Seek zamanını atomik olarak kaydet ve önceki değeri döndür"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return 0.0
            prev = room.last_seek_time
            room.last_seek_time = timestamp
            return prev

    async def mark_buffer_start_time(self, room_id: str, timestamp: float) -> bool:
        """Buffer start zamanını atomik olarak kaydet"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False
            room.last_buffer_start_time = timestamp
            return True

    async def mark_buffer_end_time(self, room_id: str, timestamp: float) -> bool:
        """Buffer end zamanını atomik olarak kaydet"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False
            room.last_buffer_end_time = timestamp
            return True

    async def buffer_end_and_check_resume(
        self, room_id: str, user_id: str, now: float, min_buffer_duration: float, debounce_window: float
    ) -> dict | None:
        """
        Buffer end işlemini atomic olarak yap ve auto-resume gerekiyorsa döndür.
        Returns: None veya {"should_resume": bool, "current_time": float}
        """
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return None

            # Kısa buffer kontrolü
            buffer_duration = now - room.last_buffer_start_time
            if buffer_duration < min_buffer_duration and room.last_buffer_start_time > 0:
                # Kısa buffer - timestamp güncelle, listeden çıkar, auto-resume yapma
                room.last_buffer_end_time = now
                if user_id in room.buffering_users:
                    room.buffering_users.remove(user_id)
                return {"should_resume": False, "current_time": room.current_time}

            # Normal buffer end
            room.last_buffer_end_time = now
            if user_id in room.buffering_users:
                room.buffering_users.remove(user_id)

            # Auto-resume kontrolü (atomic)
            # Manuel pause sonrası auto-resume yapma
            if now - room.last_pause_time < debounce_window:
                return {"should_resume": False, "current_time": room.current_time}

            # Buffering users listesi boş VE video durmuşsa
            if not room.buffering_users and not room.is_playing:
                # Son buffering çok eskiyse, bu manuel pause (auto-resume yapma)
                time_since_buffer_start = now - room.last_buffer_start_time
                if time_since_buffer_start > 5.0:
                    return {"should_resume": False, "current_time": room.current_time}

                # Auto-resume yap
                room.last_auto_resume_time = now
                room.is_playing = True
                room.updated_at = now
                return {"should_resume": True, "current_time": room.current_time}

            return {"should_resume": False, "current_time": room.current_time}

    async def should_accept_pause(self, room_id: str, now: float) -> dict:
        """
        Pause kabul edilmeli mi? Atomic karar ver.
        Returns: {"accept": bool, "is_playing": bool}
        """
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return {"accept": False, "is_playing": False}

            # Zaten durmuşsa ignore
            if not room.is_playing:
                return {"accept": False, "is_playing": False}
            
            # RECOVERY SONRASI PAUSE ENGELLE (2 saniye)
            # Stall recovery'den hemen sonra client buffer/seeking yapabilir
            if now - room.last_recovery_time < 2.0:
                return {"accept": False, "is_playing": True}

            # Debounce kontrolleri
            # Sadece çok yakın zamanda auto-resume yapıldıysa engelle (300ms)
            if now - room.last_auto_resume_time < 0.3:
                return {"accept": False, "is_playing": True}

            # Manuel play'den hemen sonraki pause'ları kontrollü geçir (500ms)
            if now - room.last_play_time < 0.5:
                # Eğer auto-resume yoksa veya uzun zaman önceyse, izin ver (kullanıcı pause)
                if room.last_auto_resume_time == 0.0 or now - room.last_auto_resume_time > 0.5:
                    return {"accept": True, "is_playing": True}
                else:
                    return {"accept": False, "is_playing": True}  # Engelle (auto-resume hemen sonrası)

            # Buffer end'den hemen sonraki pause'ları engelle (200ms)
            if now - room.last_buffer_end_time < 0.2:
                return {"accept": False, "is_playing": True}

            # Buffer start'tan hemen sonraki pause'ları engelle (500ms)
            if now - room.last_buffer_start_time < 0.5:
                return {"accept": False, "is_playing": True}

            return {"accept": True, "is_playing": True}

    async def should_accept_buffer_start(self, room_id: str, now: float, debounce_window: float) -> dict:
        """
        Buffer start kabul edilmeli mi? Atomic karar ver.
        Returns: {"accept": bool, "is_first": bool, "should_pause": bool, "last_seek_time": float}
        """
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return {"accept": False, "is_first": False, "should_pause": False, "last_seek_time": 0.0}

            # İlk buffer mi?
            is_first = room.last_buffer_start_time == 0.0

            # Seek sonrası buffer mı?
            time_since_seek = now - room.last_seek_time
            is_post_seek = time_since_seek < debounce_window

            # Video oynatılıyor mu?
            should_pause = room.is_playing

            return {
                "accept"         : True,
                "is_first"       : is_first,
                "is_post_seek"   : is_post_seek,
                "should_pause"   : should_pause,
                "last_seek_time" : room.last_seek_time,
            }

    async def clear_buffering_users(self, room_id: str) -> bool:
        """Buffering users listesini temizle (atomic)"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False
            room.buffering_users.clear()
            return True

    async def schedule_delayed_buffer_pause(
        self, room_id: str, user_id: str, username: str, delay: float = 2.0
    ) -> None:
        """
        Delayed buffer pause: 2 saniye bekle, hala buffering varsa pause et.
        Bu, seek sonrası kısa buffer'ların room'u pause'a çekmesini önler.
        """
        async def delayed_pause(my_epoch: int):
            await asyncio.sleep(delay)
            
            # Snapshot al (lock içinde) + EPOCH GUARD
            async with self._lock:
                room = self.rooms.get(room_id)
                if not room:
                    return
                
                # Task tamamlandı, dictionary'den sil
                room.pending_buffer_pause_tasks.pop(user_id, None)
                
                # EPOCH GUARD (user-level): Task cancel edildiyse çık
                if my_epoch != room.buffer_pause_epoch_by_user.get(user_id, 0):
                    return  # Cancel edilmiş, broadcast etme

                # Hala buffering mi?
                if user_id not in room.buffering_users:
                    return  # Artık buffering değil, pause etme
                
                # Video oynatılıyor mu?
                if not room.is_playing:
                    return  # Zaten durmuş, tekrar pause etme
                
                # Snapshot al (lock dışında kullanmak için)
                updated_at = room.updated_at
                base_time = room.current_time
            
            # Lock dışında elapsed hesapla ve broadcast
            now = time.perf_counter()
            current_time = base_time + (now - updated_at)
            
            await self.update_playback_state(room_id, False, current_time)
            
            await self.broadcast_to_room(room_id, {
                "type"         : "sync",
                "is_playing"   : False,
                "current_time" : current_time,
                "triggered_by" : f"{username} (Buffering...)"
            })
        
        # Önceki task'ı iptal et
        await self.cancel_delayed_buffer_pause(room_id, user_id)
        
        # Yeni task başlat + EPOCH ARTTIR (user-level)
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            
            # User-level epoch init + increment
            room.buffer_pause_epoch_by_user[user_id] = room.buffer_pause_epoch_by_user.get(user_id, 0) + 1
            epoch = room.buffer_pause_epoch_by_user[user_id]

            task = asyncio.create_task(delayed_pause(epoch))
            room.pending_buffer_pause_tasks[user_id] = task

    async def cancel_delayed_buffer_pause(self, room_id: str, user_id: str) -> None:
        """Bekleyen delayed pause task'ını iptal et + EPOCH ARTTIR (user-level)"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            
            # User-level epoch bump (cancel mark)
            room.buffer_pause_epoch_by_user[user_id] = room.buffer_pause_epoch_by_user.get(user_id, 0) + 1

            task = room.pending_buffer_pause_tasks.pop(user_id, None)
            if task and not task.done():
                task.cancel()

    async def handle_heartbeat(self, room_id: str, user_id: str, client_time: float):
        """Heartbeat al, drift kontrolü yap ve stall detection"""
        now = time.perf_counter()
        
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            
            user = room.users.get(user_id)
            if not user:
                return

            # Drift hesapla
            server_time = room.current_time
            if room.is_playing:
                server_time += (now - room.updated_at)

            drift = client_time - server_time

            # Sadece oynatılıyorsa drift düzeltmesi yap
            if not room.is_playing:
                return
            
            # STALL DETECTION: Client donmuş mu?
            time_diff = abs(client_time - user.last_client_time)
            
            if time_diff < 0.05:  # Client time artmamış (< 50ms)
                user.stall_count += 1
            else:
                user.stall_count = 0  # Reset
            
            # Her durumda son client time'ı güncelle
            user.last_client_time = client_time
            
            # Stall şüphesi: 2 ping için daha dengeli (jitter önleme)
            stalled_suspected = user.stall_count >= 2
            # Kesin stall: 2 ping üst üste + cooldown (ping 1s → 2s'de recovery)
            stalled = user.stall_count >= 2 and now - user.last_sync_time > 3.0

            # Seek sonrası drift hesaplama yapma (kullanıcılar henüz sync olmadı)
            time_since_seek = now - room.last_seek_time
            if time_since_seek < DEBOUNCE_WINDOW:
                return  # Seek sonrası 1s içinde drift ignore

            # Drift Analizi ve Düzeltme
            correction = None
            
            # STALL RECOVERY: Client donmuşsa force sync
            if stalled:
                user.last_sync_time = now
                user.stall_count = 0
                # Recovery time'ı kaydet (pause blocking için)
                room.last_recovery_time = now
                room.last_auto_resume_time = now
                correction = {
                    "type"         : "sync",
                    "is_playing"   : True,
                    "current_time" : server_time,
                    "force_seek"   : True,
                    "triggered_by" : "System (Stall Recovery)"
                }

            # Büyük drift (> 3 saniye): COOLDOWN ile buffer correction
            # ÖNEMLI: Stall şüpheleniyorsa buffer correction GÖNDERME (kilitler)
            elif abs(drift) > 3.0 and not stalled_suspected:
                if now - user.last_sync_time > 3.0:
                    user.last_sync_time = now
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
            
            # Minimal drift (< 0.5 saniye): Normal hıza dön
            # Rate'i normalize et, modifiye edilmiş hızı sıfırla
            else:
                correction = {
                    "type"   : "sync_correction",
                    "action" : "rate",
                    "rate"   : 1.0,
                    "drift"  : drift
                }


            if correction and user_id in room.users:
                try:
                    await room.users[user_id].websocket.send_text(json.dumps(correction, ensure_ascii=False))
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

    async def get_playback_snapshot(self, room_id: str) -> dict | None:
        """Playback state'ini atomic olarak oku"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return None
            return {
                "is_playing"   : room.is_playing,
                "current_time" : room.current_time,
                "updated_at"   : room.updated_at,
            }

    async def get_room_users(self, room_id: str) -> list[dict]:
        """Odadaki kullanıcıları getir (lock protected)"""
        async with self._lock:
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

    async def get_room_state(self, room_id: str) -> dict | None:
        """Odanın mevcut durumunu getir"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return None

            # Snapshot: lock içinde kopyala, dictionary changed size hatasını önle
            room_snapshot = {
                "room_id"      : room.room_id,
                "video_url"    : room.video_url,
                "video_title"  : room.video_title,
                "video_format" : room.video_format,
                "subtitle_url" : room.subtitle_url,
                "current_time" : room.current_time,
                "is_playing"   : room.is_playing,
                "headers"      : dict(room.headers),
                "updated_at"   : room.updated_at,
                "host_id"      : room.host_id,
            }
            users_snapshot = list(room.users.values())
            chat_snapshot = list(room.chat_messages[-50:])

        # Lock dışında hesaplama ve serialization
        live_time = room_snapshot["current_time"]
        if room_snapshot["is_playing"]:
            elapsed = time.perf_counter() - room_snapshot["updated_at"]
            live_time += elapsed

        return {
            "room_id"       : room_snapshot["room_id"],
            "video_url"     : room_snapshot["video_url"],
            "video_title"   : room_snapshot["video_title"],
            "video_format"  : room_snapshot["video_format"],
            "subtitle_url"  : room_snapshot["subtitle_url"],
            "current_time"  : live_time,
            "is_playing"    : room_snapshot["is_playing"],
            "headers"       : room_snapshot["headers"],
            "users"         : [
                {
                    "user_id"  : user.user_id,
                    "username" : user.username,
                    "avatar"   : user.avatar,
                    "is_host"  : user.user_id == room_snapshot["host_id"],
                }
                for user in users_snapshot
            ],
            "chat_messages" : [
                {
                    "username"  : msg.username,
                    "avatar"    : msg.avatar,
                    "message"   : msg.message,
                    "timestamp" : msg.timestamp,
                }
                for msg in chat_snapshot
            ],
        }


# Singleton instance
watch_party_manager = WatchPartyManager()
