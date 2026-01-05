# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from dataclasses import dataclass, field
from fastapi     import WebSocket
from datetime    import datetime
import uuid, time, asyncio

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
    # Per-user buffer spam prevention
    last_buffer_trigger_time : float = 0.0   # Son buffer pause tetikleme zamanı
    buffer_trigger_count     : int   = 0     # Ardışık buffer tetikleme sayısı
    last_rate_sent           : float = 1.0   # Son gönderilen playback rate (spam önleme)
    # Concurrent send protection
    send_lock : asyncio.Lock = field(default_factory=asyncio.Lock, repr=False, compare=False)
    # Dead user tracking (send fail olunca set edilir, cleanup için)
    last_send_failed_at : float = 0.0

@dataclass
class ChatMessage:
    """Chat mesajı"""
    username  : str
    avatar    : str
    message   : str
    timestamp : str = field(default_factory=lambda: datetime.now().isoformat())
    reply_to  : dict | None = None  # {"username": str, "message": str, "avatar": str}

@dataclass
class Room:
    """Watch Party odası"""
    room_id         : str
    video_url       : str = ""
    video_title     : str = ""
    video_format    : str = "hls"  # "hls" | "mp4" | "webm" | "youtube"
    video_duration  : float = 0.0  # Video süresi (saniye) - 0 = unknown
    subtitle_url    : str = ""     # Altyazı dosyası URL'si
    current_time    : float = 0.0
    is_playing      : bool = False
    users           : dict[str, User] = field(default_factory=dict)
    user_agent      : str = ""
    referer         : str = ""
    chat_messages   : list[ChatMessage] = field(default_factory=list)
    updated_at      : float = field(default_factory=lambda: time.perf_counter())
    host_id         : str | None = None  # İlk katılan kullanıcı (host)
    buffering_users : set[str]   = field(default_factory=set)
    
    # Pause/Resume tracking
    pause_reason           : str   = ""     # "manual" | "buffer" | "system" - auto-resume kontrolü
    last_auto_resume_time  : float = 0.0    # Son auto-resume zamanı
    last_recovery_time     : float = 0.0    # Son stall recovery zamanı
    last_play_time         : float = 0.0    # Son play zamanı
    last_pause_time        : float = 0.0    # Son manuel pause zamanı
    last_seek_time         : float = 0.0    # Son seek zamanı
    
    # User-based buffer timing (kritik: user bazlı hesaplama için)
    buffer_start_time_by_user : dict[str, float] = field(default_factory=dict)  # user_id -> buffer start time
    buffer_end_time_by_user   : dict[str, float] = field(default_factory=dict)  # user_id -> buffer end time
    
    # Delayed buffer pause task management
    pending_buffer_pause_tasks : dict[str, object] = field(default_factory=dict)  # user_id -> asyncio.Task
    buffer_pause_epoch_by_user : dict[str, int]    = field(default_factory=dict)  # user-level epoch guard
    
    # Seek-sync coordination (herkes hazır olana kadar bekle)
    seek_sync_epoch          : int      = 0
    seek_sync_waiting_users  : set[str] = field(default_factory=set)
    seek_sync_was_playing    : bool     = False
    seek_sync_target_time    : float    = 0.0
    pending_seek_sync_task   : object | None = None  # asyncio.Task

