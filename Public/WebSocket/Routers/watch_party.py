# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI     import konsol
from fastapi import WebSocket, WebSocketDisconnect
from .       import wss_router
from ..Libs  import MessageHandler
import json, asyncio

@wss_router.websocket("/watch_party/{room_id}")
async def watch_party_websocket(websocket: WebSocket, room_id: str):
    """Watch Party WebSocket endpoint"""
    await websocket.accept()

    handler = MessageHandler(websocket, room_id.upper())

    try:
        while True:
            raw_message = await websocket.receive_text()

            try:
                message = json.loads(raw_message)
            except json.JSONDecodeError:
                await handler.send_error("Geçersiz JSON formatı")
                continue

            msg_type = message.get("type")

            if msg_type == "join":
                await handler.handle_join(message)

            elif msg_type == "play" and handler.user:
                await handler.handle_play(message)

            elif msg_type == "pause" and handler.user:
                await handler.handle_pause(message)

            elif msg_type == "seek" and handler.user:
                await handler.handle_seek(message)

            elif msg_type == "chat" and handler.user:
                await handler.handle_chat(message)

            elif msg_type == "video_change" and handler.user:
                asyncio.create_task(handler.handle_video_change(message))

            elif msg_type == "ping":
                await handler.handle_ping(message)

            elif msg_type == "buffer_start" and handler.user:
                await handler.handle_buffer_start()

            elif msg_type == "buffer_end" and handler.user:
                await handler.handle_buffer_end()

            elif msg_type == "get_state":
                await handler.handle_get_state()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        konsol.log(f"[red]WebSocket Error:[/] {e}")
    finally:
        await handler.handle_disconnect()
