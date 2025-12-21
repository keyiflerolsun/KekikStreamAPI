# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI     import konsol
from fastapi import WebSocket, WebSocketDisconnect
from .       import wss_router
from ..Libs  import MessageHandler
import json, asyncio, time

@wss_router.websocket("/watch_party/{room_id}")
async def watch_party_websocket(websocket: WebSocket, room_id: str):
    await websocket.accept()
    handler = MessageHandler(websocket, room_id.upper())

    def log_task_exception(t: asyncio.Task):
        try:
            exc = t.exception()
        except asyncio.CancelledError:
            return
        if exc:
            konsol.log(f"[red]ws task error:[/] {exc}")

    # (needs_user, takes_msg, background, fn)
    handlers = {
        "join"        : (False, True,  False, handler.handle_join),
        "ping"        : (False, True,  False, handler.handle_ping),
        "get_state"   : (False, False, False, handler.handle_get_state),

        "typing"      : (True,  False, False, handler.handle_typing),
        "buffer_start": (True,  False, False, handler.handle_buffer_start),
        "buffer_end"  : (True,  False, False, handler.handle_buffer_end),

        "play"        : (True,  True,  False, handler.handle_play),
        "pause"       : (True,  True,  False, handler.handle_pause),
        "seek"        : (True,  True,  False, handler.handle_seek),
        "chat"        : (True,  True,  False, handler.handle_chat),
        "seek_ready"  : (True,  True,  False, handler.handle_seek_ready),

        "video_change": (True,  True,  True,  handler.handle_video_change),
    }

    MAX_PAYLOAD = 512 * 1024  # 512 KB
    
    # Rate limiting
    general_msg_count = 0
    general_last_time = time.perf_counter()
    
    high_msg_count = 0
    high_last_time = time.perf_counter()

    HIGH_FREQ_OPS = {"ping", "seek", "seek_ready", "buffer_start", "buffer_end"}

    try:
        while True:
            raw = await websocket.receive_text()
            
            # 1. Flood Control: Payload Size
            if len(raw.encode("utf-8")) > MAX_PAYLOAD:
                await handler.send_error("Mesaj boyutu çok büyük")
                # İstersen disconnect et: break
                continue
            
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await handler.send_error("Geçersiz JSON formatı")
                continue

            t = msg.get("type")
            if not t:
                continue

            # 2. Flood Control: Rate Limit (Dual Bucket)
            now = time.perf_counter()
            
            if t in HIGH_FREQ_OPS:
                # High Frequency Bucket (30/s)
                if now - high_last_time > 1.0:
                    high_msg_count = 0
                    high_last_time = now
                
                high_msg_count += 1
                if high_msg_count > 30:
                    # High freq limit aşımı - sessiz drop veya error
                    # await handler.send_error("Çok hızlı işlem (high-freq)") 
                    continue
            else:
                # General Bucket (10/s)
                if now - general_last_time > 1.0:
                    general_msg_count = 0
                    general_last_time = now
                
                general_msg_count += 1
                if general_msg_count > 10:
                    await handler.send_error("Çok hızlı işlem yapıyorsunuz")
                    continue

            entry = handlers.get(t)
            if not entry:
                continue

            needs_user, takes_msg, bg, fn = entry

            if needs_user and not handler.user:
                continue

            call = (lambda f=fn, m=msg: f(m)) if takes_msg else (lambda f=fn: f())

            if bg:
                task = asyncio.create_task(call())
                task.add_done_callback(log_task_exception)
            else:
                await call()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        konsol.log(f"[red]WebSocket Error:[/] {e}")
    finally:
        await handler.handle_disconnect()
