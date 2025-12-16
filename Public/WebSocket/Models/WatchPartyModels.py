# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from dataclasses import dataclass, field
from fastapi     import WebSocket
from datetime    import datetime
import uuid

@dataclass
class User:
    """Watch Party kullanıcısı"""
    websocket : WebSocket
    username  : str
    avatar    : str
    user_id   : str = field(default_factory=lambda: str(uuid.uuid4())[:8])

@dataclass
class ChatMessage:
    """Chat mesajı"""
    username  : str
    avatar    : str
    message   : str
    timestamp : str = field(default_factory=lambda: datetime.now().isoformat())

@dataclass
class Room:
    """Watch Party odası"""
    room_id         : str
    video_url       : str = ""
    video_title     : str = ""
    video_format    : str = "hls"  # "hls" | "mp4" | "webm" | "youtube"
    subtitle_url    : str = ""     # Altyazı dosyası URL'si
    current_time    : float = 0.0
    is_playing      : bool = False
    users           : dict[str, User] = field(default_factory=dict)
    chat_messages   : list[ChatMessage] = field(default_factory=list)
    headers         : dict[str, str] = field(default_factory=dict)  # User-Agent, Referer vb.
    updated_at      : float = field(default_factory=lambda: datetime.now().timestamp())
    host_id         : str | None = None  # İlk katılan kullanıcı (host)
    buffering_users : set[str] = field(default_factory=set)
