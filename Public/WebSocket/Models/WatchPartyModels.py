# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from dataclasses import dataclass, field
from fastapi     import WebSocket
from datetime    import datetime
import uuid, time

@dataclass
class User:
    """Watch Party kullanıcısı"""
    websocket : WebSocket
    username  : str
    avatar    : str
    user_id   : str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    # Stall detection
    last_client_time  : float = 0.0  # Son heartbeat'teki client time
    stall_count       : int   = 0    # Ardışık stall sayısı
    last_sync_time    : float = 0.0  # Son force sync zamanı (spam önleme)

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
    updated_at      : float = field(default_factory=lambda: time.perf_counter())
    host_id         : str | None = None  # İlk katılan kullanıcı (host)
    buffering_users : set[str]   = field(default_factory=set)
    last_auto_resume_time  : float = 0.0  # Son auto-resume zamanı - gecikmeli pause önleme
    last_recovery_time     : float = 0.0  # Son stall recovery zamanı - recovery sonrası pause önleme
    last_play_time         : float = 0.0  # Son play zamanı - gecikmeli pause önleme
    last_pause_time        : float = 0.0  # Son manuel pause zamanı - pause sonrası auto-resume önleme
    last_buffer_end_time   : float = 0.0  # Son buffer_end zamanı - gecikmeli pause önleme
    last_buffer_start_time : float = 0.0  # Son buffer_start zamanı - kısa buffer ignore
    last_seek_time         : float = 0.0  # Son seek zamanı - seek sonrası buffer ignore
    pending_buffer_pause_tasks : dict[str, object] = field(default_factory=dict)  # user_id -> asyncio.Task
    buffer_pause_epoch_by_user : dict[str, int]    = field(default_factory=dict)  # user-level epoch guard
