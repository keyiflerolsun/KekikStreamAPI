# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi  import WebSocket
from ..Models import User, Room, ChatMessage
import json, asyncio, time

# ============== Timing Constants (seconds) ==============
DEBOUNCE_WINDOW = 1.0       # Genel debounce penceresi (tüm race condition'lar için)
MIN_BUFFER_DURATION = 2.0   # Minimum buffer süresi (kısa buffer'ları ignore)

class WatchPartyManager:
    """Watch Party oda ve kullanıcı yönetimi"""

    def __init__(self):
        self.rooms: dict[str, Room] = {}
        self._lock = asyncio.Lock()

    async def get_room(self, room_id: str) -> Room | None:
        """Odayı getir (lock protected)"""
        async with self._lock:
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
        should_resume = False
        resume_time = 0.0
        task_to_cancel = None

        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False

            if user_id not in room.users:
                return False

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
            
            # Buffer timing dict cleanup
            room.buffer_start_time_by_user.pop(user_id, None)
            room.buffer_end_time_by_user.pop(user_id, None)

            # Barrier sync: leaver waiting set'teyse çıkar + complete check
            if user_id in room.seek_sync_waiting_users:
                room.seek_sync_waiting_users.discard(user_id)

                # Seek veya resume barrier aktif + bekleyen kalmadıysa tamamla
                if room.pause_reason in ("seek", "resume_sync") and not room.seek_sync_waiting_users:
                    task_to_cancel = room.pending_seek_sync_task
                    room.pending_seek_sync_task = None

                    if room.seek_sync_was_playing:
                        should_resume = True
                        room.is_playing = True
                        room.updated_at = time.perf_counter()

                    room.pause_reason = ""
                    resume_time = room.current_time

            # Host ayrıldıysa yeni host ata
            if room.host_id == user_id and room.users:
                room.host_id = next(iter(room.users.keys()))

            # Oda boşsa sil (ve resume anlamsız)
            if not room.users:
                should_resume = False  # kimse kalmadı, resume anlamsız
                
                # Pending tasks cleanup
                if room.pending_seek_sync_task and not room.pending_seek_sync_task.done():
                    room.pending_seek_sync_task.cancel()
                
                for task in room.pending_buffer_pause_tasks.values():
                    if not task.done():
                        task.cancel()

                del self.rooms[room_id]

        # Lock dışında task iptal et
        if task_to_cancel and not task_to_cancel.done():
            task_to_cancel.cancel()

        # Lock dışında broadcast
        if should_resume:
            now = time.perf_counter() # Tutarlı zaman (broadcast anı)
            await self.broadcast_to_room(room_id, {
                "type"         : "sync",
                "is_playing"   : True,
                "current_time" : resume_time,
                "force_seek"   : True,
                "triggered_by" : "System (Seek Sync: user left)"
            })

        return True

    async def update_video(self, room_id: str, url: str, title: str = "", video_format: str = "hls", user_agent: str = "", referer: str = "", subtitle_url: str = "", duration: float = 0.0) -> bool:
        """Video URL'sini güncelle - full state reset yapılır"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False

            # Pending buffer task'ları iptal et
            for t in room.pending_buffer_pause_tasks.values():
                if t and not t.done():
                    t.cancel()
            room.pending_buffer_pause_tasks.clear()
            room.buffer_pause_epoch_by_user.clear()

            # Seek-sync cleanup (ghost task önleme)
            if room.pending_seek_sync_task and not room.pending_seek_sync_task.done():
                room.pending_seek_sync_task.cancel()
            room.pending_seek_sync_task = None
            room.seek_sync_waiting_users.clear()
            room.seek_sync_epoch = 0
            room.seek_sync_was_playing = False
            room.seek_sync_target_time = 0.0

            # Buffer timing reset
            room.buffering_users.clear()
            room.buffer_start_time_by_user.clear()
            room.buffer_end_time_by_user.clear()

            # Pause/resume state reset
            room.pause_reason = ""
            room.last_auto_resume_time = 0.0
            room.last_recovery_time = 0.0
            room.last_play_time = 0.0
            room.last_pause_time = 0.0
            room.last_seek_time = 0.0

            # Video state
            room.video_url      = url
            room.video_title    = title
            room.video_format   = video_format
            room.video_duration = duration
            room.is_live        = (duration <= 0.0 and video_format == "hls")
            room.subtitle_url   = subtitle_url
            room.user_agent     = user_agent
            room.referer        = referer
            room.current_time   = 0.0
            room.is_playing     = False
            room.updated_at     = time.perf_counter()
            return True

    async def update_playback_state(self, room_id: str, is_playing: bool, current_time: float, pause_reason: str | None = None, now: float | None = None) -> bool:
        """Oynatım durumunu güncelle - opsiyonel pause_reason için atomik"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False

            room.is_playing   = is_playing
            room.current_time = current_time
            room.updated_at   = now if now is not None else time.perf_counter()
            
            # Atomik pause_reason güncellemesi
            if pause_reason is not None:
                room.pause_reason = pause_reason

            return True

    def _calc_live_time_locked(self, room, now: float) -> float:
        """Lock içinde çağrılmalı: odanın canlı zamanını hesapla (duration clamp'li)"""
        t = room.current_time
        if room.is_playing:
            t += (now - room.updated_at)

        if room.video_duration > 0:
            t = min(t, room.video_duration)

        if t < 0:
            t = 0.0
        return t

    async def pause_now(self, room_id: str, now: float, reason: str = "manual") -> float | None:
        """Server-otoriteli pause: canlı zamanı hesapla ve odayı durdur"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return None

            t = self._calc_live_time_locked(room, now)
            room.is_playing = False
            room.current_time = t
            room.updated_at = now
            room.pause_reason = reason
            return t

    async def resume_soft(self, room_id: str, now: float) -> float | None:
        """Soft resume: odayı direkt playing yap (bariyer yok)"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return None

            t = room.current_time
            if room.video_duration > 0:
                t = min(t, room.video_duration)

            room.current_time = t
            room.is_playing = True
            room.updated_at = now
            room.pause_reason = ""
            return t

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

    async def mark_buffer_start_time(self, room_id: str, user_id: str, timestamp: float) -> bool:
        """Buffer start zamanını user bazında atomik olarak kaydet"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return False
            room.buffer_start_time_by_user[user_id] = timestamp
            return True

    async def buffer_end_and_check_resume(
        self, room_id: str, user_id: str, now: float, min_buffer_duration: float, debounce_window: float
    ) -> dict | None:
        """
        Buffer end işlemini atomic olarak yap ve auto-resume gerekiyorsa döndür.
        User-based buffer timing kullanır.
        Returns: None veya {"should_resume": bool, "current_time": float}
        """
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return None

            # User-based kısa buffer kontrolü
            user_buffer_start = room.buffer_start_time_by_user.get(user_id, 0.0)
            buffer_duration = now - user_buffer_start
            
            # Buffer end zamanını kaydet
            room.buffer_end_time_by_user[user_id] = now
            
            if buffer_duration < min_buffer_duration and user_buffer_start > 0:
                # Kısa buffer - listeden çıkar, auto-resume yapma
                if user_id in room.buffering_users:
                    room.buffering_users.remove(user_id)
                return {"should_resume": False, "current_time": room.current_time}

            # Normal buffer end - listeden çıkar
            if user_id in room.buffering_users:
                room.buffering_users.remove(user_id)

            # Auto-resume kontrolü (atomic)
            # Sadece buffer kaynaklı pause'ta auto-resume yap
            if room.pause_reason != "buffer":
                return {"should_resume": False, "current_time": room.current_time}
            
            # Manuel pause sonrası auto-resume yapma
            if now - room.last_pause_time < debounce_window:
                return {"should_resume": False, "current_time": room.current_time}

            # Buffering users listesi boş VE video durmuşsa auto-resume
            if not room.buffering_users and not room.is_playing:
                room.last_auto_resume_time = now
                room.is_playing = True
                room.pause_reason = ""  # Pause reason temizle
                room.updated_at = now  # Tutarlılık: now kullan
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

            # Zaten durmuşsa:
            if not room.is_playing:
                # Buffer/Seek pause'u manuel pause'a çevirmeye izin ver
                # (kullanıcı auto-resume'u engellemek isteyebilir)
                if room.pause_reason in ("buffer", "seek"):
                    return {"accept": True, "is_playing": False}
                return {"accept": False, "is_playing": False}
            
            # RECOVERY SONRASI PAUSE ENGELLE (2 saniye)
            if now - room.last_recovery_time < 2.0:
                return {"accept": False, "is_playing": True}

            # Debounce kontrolleri
            # Sadece çok yakın zamanda auto-resume yapıldıysa engelle (300ms)
            if now - room.last_auto_resume_time < 0.3:
                return {"accept": False, "is_playing": True}

            # Manuel play'den hemen sonraki pause'ları kontrollü geçir (500ms)
            if now - room.last_play_time < 0.5:
                if room.last_auto_resume_time == 0.0 or now - room.last_auto_resume_time > 0.5:
                    return {"accept": True, "is_playing": True}
                else:
                    return {"accept": False, "is_playing": True}

            # User-based: Herhangi bir kullanıcı yakın zamanda buffer end yaptıysa engelle
            latest_buffer_end = max(room.buffer_end_time_by_user.values()) if room.buffer_end_time_by_user else 0.0
            if now - latest_buffer_end < 0.2:
                return {"accept": False, "is_playing": True}

            # User-based: Herhangi bir kullanıcı yakın zamanda buffer start yaptıysa engelle
            latest_buffer_start = max(room.buffer_start_time_by_user.values()) if room.buffer_start_time_by_user else 0.0
            if now - latest_buffer_start < 0.5:
                return {"accept": False, "is_playing": True}

            return {"accept": True, "is_playing": True}

    async def should_accept_buffer_start(self, room_id: str, user_id: str, now: float, debounce_window: float) -> dict:
        """
        Buffer start kabul edilmeli mi? Atomic karar ver. User-based timing kullanır.
        Returns: {"accept": bool, "is_first": bool, "is_post_seek": bool, "should_pause": bool}
        """
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return {"accept": False, "is_first": False, "is_post_seek": False, "should_pause": False}

            # User-based: Bu kullanıcının son buffer start zamanı
            user_last_buffer_start = room.buffer_start_time_by_user.get(user_id, 0.0)
            time_since_last_buffer = now - user_last_buffer_start
            if user_last_buffer_start > 0.0 and time_since_last_buffer < 0.3:
                return {"accept": False, "is_first": False, "is_post_seek": False, "should_pause": False}

            # İlk buffer mi? (bu kullanıcı için)
            is_first = user_last_buffer_start == 0.0

            # Seek sonrası buffer mı?
            time_since_seek = now - room.last_seek_time
            is_post_seek = time_since_seek < debounce_window

            # Video oynatılıyor mı?
            should_pause = room.is_playing

            return {
                "accept"       : True,
                "is_first"     : is_first,
                "is_post_seek" : is_post_seek,
                "should_pause" : should_pause,
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
        
        Per-user spam prevention: Aynı kullanıcı 30 saniyede 3+ kez tetiklerse, ignore et.
        """
        # Önceki task'ı HER ZAMAN iptal et (spam olsa bile)
        # Bu, spam return olduğunda eski task'ın ghost-pause yapmasını önler
        await self.cancel_delayed_buffer_pause(room_id, user_id)
        
        now = time.perf_counter()
        
        # Per-user buffer spam kontrolü
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            
            user = room.users.get(user_id)
            if not user:
                return
            
            # 30 saniye içinde kaç kez tetikledi?
            time_since_last = now - user.last_buffer_trigger_time
            
            if time_since_last < 30.0:
                user.buffer_trigger_count += 1
            else:
                # 30 saniyeden fazla geçti, sayacı sıfırla
                user.buffer_trigger_count = 1
            
            user.last_buffer_trigger_time = now
            
            # 30 saniyede 3+ kez tetiklediyse, bu kullanıcıyı ignore et
            if user.buffer_trigger_count > 3:
                return  # Eski task zaten iptal edildi, güvenli
        
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
                video_duration = room.video_duration  # Duration cap için
            
            # Lock dışında elapsed hesapla
            now = time.perf_counter()
            current_time = base_time + (now - updated_at)
            
            # VIDEO DURATION CAP (Fix #3)
            if video_duration > 0:
                current_time = min(current_time, video_duration)
            
            # Atomik update: is_playing=False + pause_reason="buffer" tek lock'ta (Fix #6)
            await self.update_playback_state(room_id, False, current_time, pause_reason="buffer", now=now)
            
            await self.broadcast_to_room(room_id, {
                "type"         : "sync",
                "is_playing"   : False,
                "current_time" : current_time,
                "force_seek"   : True,  # Client'ların tam aynı karede durması için
                "triggered_by" : f"{username} (Buffering...)"
            })
        
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

    async def cancel_delayed_buffer_pause(self, room_id: str, user_id: str | None = None) -> None:
        """Bekleyen delayed pause task(larını) iptal et + epoch bump. user_id=None ise hepsini iptal et."""
        tasks_to_cancel = []

        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return

            if user_id is None:
                # ALL
                for uid, task in room.pending_buffer_pause_tasks.items():
                    room.buffer_pause_epoch_by_user[uid] = room.buffer_pause_epoch_by_user.get(uid, 0) + 1
                    if task and not task.done():
                        tasks_to_cancel.append(task)
                room.pending_buffer_pause_tasks.clear()
            else:
                # ONE
                room.buffer_pause_epoch_by_user[user_id] = room.buffer_pause_epoch_by_user.get(user_id, 0) + 1
                task = room.pending_buffer_pause_tasks.pop(user_id, None)
                if task and not task.done():
                    tasks_to_cancel.append(task)

        for t in tasks_to_cancel:
            t.cancel()

    # ==================== BARRIER SYNC (SEEK & RESUME) ====================

    async def _begin_barrier(
        self, room_id: str, *, reason: str, target_time: float, was_playing: bool,
        now: float, timeout: float
    ) -> tuple[int, float]:
        """Internal: Barrier sync başlat (seek veya resume için ortak)"""
        old_task = None
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return (0, 0.0)

            old_task = room.pending_seek_sync_task
            room.pending_seek_sync_task = None

            room.seek_sync_epoch += 1
            epoch = room.seek_sync_epoch

            # Duration clamp
            if room.video_duration > 0:
                target_time = max(0.0, min(target_time, room.video_duration))

            room.seek_sync_was_playing = was_playing
            room.seek_sync_target_time = target_time
            room.seek_sync_waiting_users = set(room.users.keys())

            room.is_playing = False
            room.current_time = target_time
            room.updated_at = now
            room.pause_reason = reason
            room.buffering_users.clear()

        if old_task and not old_task.done():
            old_task.cancel()

        async def _timeout_guard(my_epoch: int):
            await asyncio.sleep(timeout)
            await self._force_complete_barrier(room_id, my_epoch, reason)

        task = asyncio.create_task(_timeout_guard(epoch))
        async with self._lock:
            room = self.rooms.get(room_id)
            if room and room.seek_sync_epoch == epoch:
                room.pending_seek_sync_task = task
            else:
                task.cancel()

        return (epoch, target_time)

    async def _mark_barrier_ready(
        self, room_id: str, user_id: str, epoch: int, now: float, reason: str
    ) -> dict | None:
        """Internal: Client ready bildirimi (seek veya resume için ortak)"""
        task_to_cancel = None

        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return None

            if room.pause_reason != reason or epoch != room.seek_sync_epoch:
                return {"should_resume": False, "current_time": room.current_time}

            room.seek_sync_waiting_users.discard(user_id)

            if room.seek_sync_waiting_users:
                return {"should_resume": False, "current_time": room.current_time}

            # Herkes hazır!
            task_to_cancel = room.pending_seek_sync_task
            room.pending_seek_sync_task = None

            should_resume = room.seek_sync_was_playing
            if should_resume:
                room.is_playing = True
                room.updated_at = now

            room.pause_reason = ""
            result = {"should_resume": should_resume, "current_time": room.current_time}

        if task_to_cancel and not task_to_cancel.done():
            task_to_cancel.cancel()

        return result

    async def _force_complete_barrier(self, room_id: str, epoch: int, reason: str):
        """Internal: Timeout handler (seek veya resume için ortak)"""
        now = time.perf_counter()
        should_resume = False
        current_time = 0.0

        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            if room.pause_reason != reason or room.seek_sync_epoch != epoch:
                return

            should_resume = room.seek_sync_was_playing
            current_time = room.current_time

            room.seek_sync_waiting_users.clear()
            room.pending_seek_sync_task = None
            if should_resume:
                room.is_playing = True
                room.updated_at = now
            room.pause_reason = ""

        if should_resume:
            label = "Seek Sync" if reason == "seek" else "Resume Sync"
            await self.broadcast_to_room(room_id, {
                "type"         : "sync",
                "is_playing"   : True,
                "current_time" : current_time,
                "force_seek"   : True,
                "triggered_by" : f"System ({label} Timeout)"
            })

    # ==================== PUBLIC BARRIER API ====================

    async def begin_seek_sync(
        self, room_id: str, target_time: float, was_playing: bool, now: float, timeout: float = 8.0
    ) -> tuple[int, float]:
        """Seek-sync başlat: herkesin hazır olmasını bekle"""
        return await self._begin_barrier(
            room_id, reason="seek", target_time=target_time, was_playing=was_playing,
            now=now, timeout=timeout
        )

    async def mark_seek_ready(self, room_id: str, user_id: str, epoch: int, now: float) -> dict | None:
        """Seek için client ready"""
        return await self._mark_barrier_ready(room_id, user_id, epoch, now, "seek")

    async def cancel_seek_sync(self, room_id: str):
        """Seek-sync veya Resume-sync'i iptal et (manuel override)"""
        task = None
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            room.seek_sync_waiting_users.clear()
            task = room.pending_seek_sync_task
            room.pending_seek_sync_task = None
            if room.pause_reason in ("seek", "resume_sync"):
                room.pause_reason = ""

        if task and not task.done():
            task.cancel()

    async def handle_heartbeat(self, room_id: str, user_id: str, client_time: float):
        """Heartbeat al, drift kontrolü yap ve stall detection"""
        now = time.perf_counter()
        
        ws = None
        payload = None

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
            
            # VIDEO DURATION CAP: Server time video süresini geçmesin
            if room.video_duration > 0:
                server_time = min(server_time, room.video_duration)
                
                # Video bitti mi? (client ve server video sonuna yakın)
                video_near_end = room.video_duration - 0.5  # 0.5s tolerance
                if client_time >= video_near_end or server_time >= video_near_end:
                    # Video bitmiş, stall detection ve drift correction yapma
                    return

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
            
            # LIVE STREAM LOGIC
            if room.is_live:
                # Stall veya büyük drift (>3s) -> live edge'e çek
                if stalled or (abs(drift) > 3.0 and not stalled_suspected and now - user.last_sync_time > 3.0):
                    user.last_sync_time = now
                    user.stall_count = 0
                    correction = {
                        "type"   : "sync_correction",
                        "action" : "live_edge",
                        "offset" : 2.0,  # live edge'den 2s geride dur (safe buffer)
                        "drift"  : drift
                    }
                else:
                    # Küçük driftler için rate correction (aşağıda) devam etsin
                    pass

            # NORMAL VOD LOGIC (veya live'da küçük drift)
            if not correction:
                # STALL RECOVERY: Client donmuşsa force sync
                if stalled:
                    user.last_sync_time = now
                    user.stall_count = 0
                    room.last_recovery_time = now
                    room.last_auto_resume_time = now
                    correction = {
                        "type"         : "sync",
                        "is_playing"   : True,
                        "current_time" : server_time,
                        "force_seek"   : True,
                        "triggered_by" : "System (Stall Recovery)"
                    }

                # Büyük drift (> 3 saniye): Buffer correction
                elif abs(drift) > 3.0 and not stalled_suspected:
                    if now - user.last_sync_time > 3.0:
                        user.last_sync_time = now
                        correction = {
                            "type"        : "sync_correction",
                            "action"      : "buffer",
                            "target_time" : server_time,
                            "drift"       : drift
                        }

                # Orta drift (1.5-3.0 saniye): Rate correction
                elif drift < -1.5:
                    correction = {"type": "sync_correction", "action": "rate", "rate": 1.05, "drift": drift}
                elif drift > 1.5:
                    correction = {"type": "sync_correction", "action": "rate", "rate": 0.95, "drift": drift}
                
                # Minimal drift (< 0.5): Sadece gerekirse 1.0'a çek (spam önleme)
                elif abs(drift) < 0.5:
                    if user.last_rate_sent != 1.0:
                        correction = {"type": "sync_correction", "action": "rate", "rate": 1.0, "drift": drift}
                    else:
                        correction = None
                
                # Küçük drift (0.5-1.5): Hafif ayar
                elif drift < -0.5:
                    correction = {"type": "sync_correction", "action": "rate", "rate": 1.02, "drift": drift}
                elif drift > 0.5:
                    correction = {"type": "sync_correction", "action": "rate", "rate": 0.98, "drift": drift}

            # Correction varsa gönder + last_rate_sent güncelle
            if correction:
                if correction.get("action") == "rate":
                    user.last_rate_sent = correction["rate"]
                else:
                    user.last_rate_sent = 1.0
                
                # Payload'ı lock içinde hazırla
                ws = user.websocket
                payload = json.dumps(correction, ensure_ascii=False)
        
        # Lock dışı gönderim (Critical Performance Fix)
        if ws and payload:
            try:
                await ws.send_text(payload)
            except Exception:
                pass

    async def add_chat_message(self, room_id: str, username: str, avatar: str, message: str) -> ChatMessage | None:
        """Chat mesajı ekle (lock protected)"""
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return None

            chat_msg = ChatMessage(username=username, avatar=avatar, message=message)
            room.chat_messages.append(chat_msg)

            # Son 100 mesajı tut
            if len(room.chat_messages) > 100:
                room.chat_messages = room.chat_messages[-100:]

            return chat_msg

    async def broadcast_to_room(self, room_id: str, message: dict, exclude_user_id: str | None = None) -> None:
        """Odadaki herkese mesaj gönder (parallel safe send)"""
        users = await self.get_room_users_sockets(room_id)
        if not users:
            return

        message_str = json.dumps(message, ensure_ascii=False)
        
        # Helper: Safe send with timeout
        async def _safe_send(ws, msg, timeout=1.5):
            try:
                await asyncio.wait_for(ws.send_text(msg), timeout=timeout)
            except Exception:
                pass # Fail silently for slow clients

        tasks = []
        for user_id, websocket in users.items():
            if exclude_user_id and user_id == exclude_user_id:
                continue
            tasks.append(_safe_send(websocket, message_str))
            
        if tasks:
            await asyncio.gather(*tasks)

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

            room_snapshot = {
                "room_id"        : room.room_id,
                "video_url"      : room.video_url,
                "video_title"    : room.video_title,
                "video_format"   : room.video_format,
                "video_duration" : room.video_duration,  # Duration cap için eklendi
                "subtitle_url"   : room.subtitle_url,
                "current_time"   : room.current_time,
                "is_playing"     : room.is_playing,
                "user_agent"     : room.user_agent,
                "referer"        : room.referer,
                "updated_at"     : room.updated_at,
                "host_id"        : room.host_id,
            }
            users_snapshot = list(room.users.values())
            chat_snapshot = list(room.chat_messages[-50:])

        # Lock dışında hesaplama ve serialization
        live_time = room_snapshot["current_time"]
        if room_snapshot["is_playing"]:
            elapsed = time.perf_counter() - room_snapshot["updated_at"]
            live_time += elapsed
        
        # VIDEO DURATION CAP (Fix #5)
        if room_snapshot["video_duration"] > 0:
            live_time = min(live_time, room_snapshot["video_duration"])

        return {
            "room_id"       : room_snapshot["room_id"],
            "video_url"     : room_snapshot["video_url"],
            "video_title"   : room_snapshot["video_title"],
            "video_format"  : room_snapshot["video_format"],
            "subtitle_url"  : room_snapshot["subtitle_url"],
            "current_time"  : live_time,
            "is_playing"    : room_snapshot["is_playing"],
            "user_agent"    : room_snapshot["user_agent"],
            "referer"       : room_snapshot["referer"],
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
