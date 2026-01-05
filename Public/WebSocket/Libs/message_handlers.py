# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi            import WebSocket
from .WatchPartyManager import watch_party_manager, DEBOUNCE_WINDOW, MIN_BUFFER_DURATION
from .ytdlp_service     import ytdlp_extract_video_info
import json, time, asyncio


class MessageHandler:
    """WebSocket mesaj işleyici sınıfı"""

    def __init__(self, websocket: WebSocket, room_id: str):
        self.websocket = websocket
        self.room_id   = room_id
        self.user      = None

    async def send_error(self, message: str):
        """Hata mesajı gönder"""
        payload = json.dumps({
            "type"    : "error",
            "message" : message
        }, ensure_ascii=False)

        if self.user:
            async with self.user.send_lock:
                await self.websocket.send_text(payload)
        else:
            await self.websocket.send_text(payload)

    async def send_json(self, data: dict):
        """JSON mesajı gönder"""
        payload = json.dumps(data, ensure_ascii=False)
        if self.user:
            async with self.user.send_lock:
                await self.websocket.send_text(payload)
        else:
            await self.websocket.send_text(payload)

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
        """PLAY mesajını işle - Go parity ile sadeleştirildi"""
        room = await watch_party_manager.get_room(self.room_id)
        if not room or room.is_playing:
            return

        # Buffering users ve seek sync temizle (Go parity)
        await watch_party_manager.clear_buffering_users(self.room_id)
        await watch_party_manager.cancel_seek_sync(self.room_id)

        now = time.perf_counter()

        # Soft resume: direkt "playing" yap
        current_time = await watch_party_manager.resume_soft(self.room_id, now)
        if current_time is None:
            return

        # force_seek=False -> client sadece büyük fark varsa seek yapar
        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"         : "sync",
            "is_playing"   : True,
            "current_time" : current_time,
            "force_seek"   : False,
            "triggered_by" : f"{self.user.username} (Play)"
        })

    async def handle_pause(self, message: dict):
        """PAUSE mesajını işle - Go parity ile sadeleştirildi"""
        now = time.perf_counter()

        # Seek-via-pause fallback: Client pause mesajında time gönderiyorsa ve fark büyükse seek gibi davran
        raw_time = message.get("time")
        if raw_time is not None:
            try:
                req_time = float(raw_time or 0.0)
            except (TypeError, ValueError):
                req_time = None
            
            if req_time is not None and req_time >= 0:
                snap = await watch_party_manager.get_playback_snapshot(self.room_id)
                # Sadece oynatılırken seek-via-pause kabul et (paused iken time dalgalanmasın)
                if snap and snap["is_playing"]:
                    live_time = snap["current_time"]
                    live_time += (now - snap["updated_at"])

                    # Fark büyükse bu bir seek niyeti - seek olarak işle
                    if abs(req_time - live_time) > 2.0:
                        was_playing = snap["is_playing"]

                        epoch, final_time = await watch_party_manager.begin_seek_sync(
                            self.room_id, target_time=req_time, was_playing=was_playing, now=now, timeout=8.0
                        )

                        if epoch > 0:
                            await watch_party_manager.broadcast_to_room(self.room_id, {
                                "type"         : "sync",
                                "is_playing"   : False,
                                "current_time" : final_time,
                                "force_seek"   : True,
                                "seek_sync"    : True,
                                "seek_epoch"   : epoch,
                                "triggered_by" : f"{self.user.username} (Seek via Pause)"
                            })
                            return

        # Normal pause akışı (Go parity - debounce yok)
        # Seek-sync varsa iptal et (manuel pause override)
        await watch_party_manager.cancel_seek_sync(self.room_id)

        # Server-otoriteli pause
        paused_time = await watch_party_manager.pause_now(self.room_id, now, reason="manual")
        if paused_time is None:
            return

        # Herkese force_seek ile gönder - tam senkron
        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"         : "sync",
            "is_playing"   : False,
            "current_time" : paused_time,
            "force_seek"   : True,
            "triggered_by" : self.user.username
        })

    async def handle_seek(self, message: dict):
        """SEEK mesajını işle - tüm client'ları senkronize seek yap"""
        # safe: float parse hatası önleme
        raw = message.get("time", 0.0)
        try:
            current_time = float(raw or 0.0)
        except (TypeError, ValueError):
            return
        
        # Playback snapshot'i atomic olarak al
        snapshot = await watch_party_manager.get_playback_snapshot(self.room_id)
        if not snapshot:
            return
        
        now = time.perf_counter()
        
        # Seek deduplicate: Önceki seek zamanını atomic olarak kaydet ve al
        prev_seek_time = await watch_party_manager.mark_seek_time(self.room_id, now)

        # Dedup: Live time hesabı (playing ise ilerlemiştir)
        snapshot_time = snapshot["current_time"]
        if snapshot["is_playing"]:
            snapshot_time += (now - snapshot["updated_at"])

        time_diff_from_last = abs(snapshot_time - current_time)
        time_since_last_seek = now - prev_seek_time
        if time_diff_from_last < 0.2 and time_since_last_seek < 0.15:
            return

        was_playing = snapshot["is_playing"]

        # Seek-sync başlat (oda pause'a çekilir, pause_reason="seek")
        # Artık tuple döndürüyor: (epoch, clamped_target_time)
        epoch, final_time = await watch_party_manager.begin_seek_sync(
            self.room_id, target_time=current_time, was_playing=was_playing, now=now, timeout=8.0
        )

        if epoch <= 0:
            return

        # Buffer pause task'larını iptal et (seek sync sırasında gereksiz)
        await watch_party_manager.cancel_delayed_buffer_pause(self.room_id)  # ALL

        # Tüm client'lara seek-sync broadcast et (clamped time kullan)
        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"         : "sync",
            "is_playing"   : False,
            "current_time" : final_time,  # duration-clamped
            "force_seek"   : True,
            "seek_sync"    : True,
            "seek_epoch"   : epoch,
            "triggered_by" : f"{self.user.username} (Seek Sync)"
        })

    async def _handle_barrier_ready(self, message: dict, *, epoch_key: str, mark_fn, done_text: str):
        """Barrier ready mesajlarını işleyen ortak helper"""
        try:
            epoch = int(message.get(epoch_key, 0) or 0)
        except (TypeError, ValueError):
            return
        if not self.user or epoch <= 0:
            return

        now = time.perf_counter()
        result = await mark_fn(self.room_id, self.user.user_id, epoch, now)
        if not result or not result.get("should_resume"):
            return

        await watch_party_manager.broadcast_to_room(self.room_id, {
            "type"         : "sync",
            "is_playing"   : True,
            "current_time" : result["current_time"],
            "force_seek"   : True,
            "triggered_by" : done_text
        })

    async def handle_seek_ready(self, message: dict):
        """SEEK_READY mesajını işle"""
        return await self._handle_barrier_ready(
            message, epoch_key="seek_epoch",
            mark_fn=watch_party_manager.mark_seek_ready,
            done_text="System (Seek Sync Complete)"
        )

    async def handle_chat(self, message: dict):
        """CHAT mesajını işle"""
        chat_message = message.get("message", "").strip()
        if not chat_message:
            return

        # Reply bilgisini al (opsiyonel)
        reply_to = message.get("reply_to")

        chat_msg = await watch_party_manager.add_chat_message(
            self.room_id, self.user.username, self.user.avatar, chat_message, reply_to
        )

        if chat_msg:
            broadcast_data = {
                "type"      : "chat",
                "username"  : self.user.username,
                "avatar"    : self.user.avatar,
                "message"   : chat_message,
                "timestamp" : chat_msg.timestamp
            }
            
            # Reply bilgisi varsa ekle
            if reply_to:
                broadcast_data["reply_to"] = reply_to
            
            await watch_party_manager.broadcast_to_room(self.room_id, broadcast_data)

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

        info = await ytdlp_extract_video_info(url)

        stream_url = url
        fmt = "hls" if ".m3u8" in url.lower() else "mp4"
        thumb = None
        duration = 0

        if info and info.get("stream_url"):
            stream_url = info["stream_url"]
            fmt        = info.get("format", fmt)
            thumb      = info.get("thumbnail")
            duration   = info.get("duration", 0) or 0

            # HLS duration güvenilmez -> 0 (unknown) kabul et
            # Bu, server'daki tüm clamp'lerin HLS'de devreye girmesini önler
            if fmt == "hls":
                duration = 0.0
            else:
                try:
                    duration = float(duration)
                except (TypeError, ValueError):
                    duration = 0.0

            h = info.get("http_headers") or {}
            user_agent = h.get("user-agent") or user_agent
            referer    = h.get("referer") or referer

        title = custom_title or (info.get("title") if info else None) or "Video"

        await watch_party_manager.update_video(
            self.room_id,
            url=stream_url, title=title, video_format=fmt,
            user_agent=user_agent, referer=referer,
            subtitle_url=subtitle_url, duration=duration
        )

        payload = {
            "type"         : "video_changed",
            "url"          : stream_url,
            "title"        : title,
            "format"       : fmt,
            "duration"     : duration,
            "user_agent"   : user_agent,
            "referer"      : referer,
            "subtitle_url" : subtitle_url,
            "changed_by"   : self.user.username
        }
        if thumb:
            payload["thumbnail"] = thumb

        await watch_party_manager.broadcast_to_room(self.room_id, payload)

    async def handle_ping(self, message: dict):
        """PING mesajını işle"""
        # Client'tan gelen _ping_id'yi geri döndür (RTT hesabı için)
        ping_id = message.get("_ping_id")
        pong_response = {"type": "pong"}
        if ping_id is not None:
            pong_response["_ping_id"] = ping_id
        
        await self.send_json(pong_response)

        # Her zaman current_time gönderilir (video durmuşsa bile)
        if self.user:
            # safe: float parse hatası önleme
            try:
                client_time = float(message.get("current_time", 0.0) or 0.0)
            except (TypeError, ValueError):
                client_time = 0.0
            
            # syncing flag: client senkronizasyon sırasında ise drift/stall hesaplamalarını ignore et
            # Bool normalize: "true" gibi saçma string değerler karşısında güvenli
            is_syncing = (message.get("syncing") is True)
            await watch_party_manager.handle_heartbeat(self.room_id, self.user.user_id, client_time, is_syncing)

    async def handle_buffer_start(self):
        """BUFFER_START mesajını işle - Go parity: spam prevention + delayed pause"""
        now = time.perf_counter()
        
        # Per-user buffer spam prevention (30s'de 3+ trigger → ignore)
        time_since_last = now - self.user.last_buffer_trigger_time
        if time_since_last < 30.0:
            self.user.buffer_trigger_count += 1
        else:
            self.user.buffer_trigger_count = 1
        self.user.last_buffer_trigger_time = now
        
        # 30 saniyede 3+ kez buffer tetiklediyse ignore et
        if self.user.buffer_trigger_count > 3:
            return
        
        # Buffer start zamanını kaydet
        await watch_party_manager.mark_buffer_start_time(self.room_id, self.user.user_id, now)
        await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, True)
        
        # Delayed buffer pause: 2 saniye bekle, hala buffering varsa odayı pause'a al
        asyncio.create_task(self._delayed_buffer_pause(self.room_id, self.user.user_id, now))
    
    async def _delayed_buffer_pause(self, room_id: str, user_id: str, start_time: float):
        """2 saniye sonra hala buffering varsa odayı pause'a al (Go parity)"""
        await asyncio.sleep(2.0)
        
        result = await watch_party_manager.check_and_apply_buffer_pause(room_id, user_id, start_time)
        if result and result.get("should_broadcast"):
            await watch_party_manager.broadcast_to_room(room_id, {
                "type"         : "sync",
                "is_playing"   : False,
                "current_time" : result["current_time"],
                "force_seek"   : False,
                "triggered_by" : "System (Buffer Pause)"
            })

    async def handle_buffer_end(self):
        """BUFFER_END mesajını işle - Go parity: auto resume when all buffers cleared"""
        now = time.perf_counter()
        
        # Buffer end zamanını kaydet ve status güncelle
        await watch_party_manager.mark_buffer_end_time(self.room_id, self.user.user_id, now)
        await watch_party_manager.set_buffering_status(self.room_id, self.user.user_id, False)
        
        # Auto resume: Buffer pause durumunda ve hiç buffering kullanıcı kalmadıysa
        result = await watch_party_manager.check_and_apply_auto_resume(self.room_id, now)
        if result and result.get("should_broadcast"):
            await watch_party_manager.broadcast_to_room(self.room_id, {
                "type"         : "sync",
                "is_playing"   : True,
                "current_time" : result["current_time"],
                "force_seek"   : False,
                "triggered_by" : "System (Auto Resume)"
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
