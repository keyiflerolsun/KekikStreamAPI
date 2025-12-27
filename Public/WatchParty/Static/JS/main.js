// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

// Module Imports
import { generateRandomUser } from './modules/utils.min.js';
import { initUI, showToast, copyRoomLink, toggleElement, showLoadingOverlay } from './modules/ui.min.js';
import { initChat, addChatMessage, addSystemMessage, updateUsersList, loadChatHistory, setCurrentUsername, showTypingIndicator } from './modules/chat.min.js';
import {
    initPlayer,
    setPlayerCallbacks,
    setupVideoEventListeners,
    loadVideo,
    applyState,
    handleSync,
    handleSeek,
    handleSyncCorrection,
    getCurrentTime,
    isPlaying,
    getLastLoadedUrl,
    updateVideoInfo
} from './modules/player.min.js';
import { connect, send, onMessage, setHeartbeatDataProvider } from './modules/websocket.min.js';

// ============== State ==============
const state = {
    currentUser: null
};

// ============== Go Service Detection ==============
const GO_PROXY_PORT = 3311;
const GO_WS_PORT = 3312;

const detectGoServices = async () => {
    // Proxy health check
    try {
        const proxyRes = await fetch(`${window.location.protocol}//${window.location.hostname}:${GO_PROXY_PORT}/health`, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
        window.GO_PROXY_AVAILABLE = proxyRes.ok;
    } catch {
        window.GO_PROXY_AVAILABLE = false;
    }
    
    // WebSocket health check
    try {
        const wsRes = await fetch(`${window.location.protocol}//${window.location.hostname}:${GO_WS_PORT}/health`, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
        window.GO_WS_AVAILABLE = wsRes.ok;
    } catch {
        window.GO_WS_AVAILABLE = false;
    }
    
    const proxyStatus = window.GO_PROXY_AVAILABLE ? '✅ Go' : '⚠️ Python';
    const wsStatus = window.GO_WS_AVAILABLE ? '✅ Go' : '⚠️ Python';
    
    console.log(
        `%c[🔌 SERVICE]%c Proxy: ${proxyStatus}, WS: ${wsStatus}`,
        'color: #a855f7; font-weight: bold;',
        ''
    );
};

// ============== Config ==============
const getRoomConfig = () => {
    const roomId = window.ROOM_ID || document.getElementById('room-id')?.textContent || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Go WS varsa Go portunu, yoksa Python (same origin) kullan
    let wsUrl;
    if (window.GO_WS_AVAILABLE === true) {
        wsUrl = `${protocol}//${window.location.hostname}:${GO_WS_PORT}/wss/watch_party/${roomId}`;
    } else {
        wsUrl = `${protocol}//${window.location.host}/wss/watch_party/${roomId}`;
    }
    
    return { roomId, wsUrl };
};

// ============== Message Handlers ==============
const setupMessageHandlers = () => {
    onMessage('room_state', handleRoomState);
    onMessage('user_joined', handleUserJoined);
    onMessage('user_left', handleUserLeft);
    onMessage('sync', handleSync);
    onMessage('sync_correction', handleSyncCorrection);
    onMessage('seek', handleSeek);
    onMessage('chat', handleChatMessage);
    onMessage('typing', handleTypingIndicator); // 🆕 Typing indicator
    onMessage('video_changed', handleVideoChanged);
    onMessage('error', (msg) => showToast(msg.message, 'error'));
};

const handleRoomState = async (roomState) => {
    updateUsersList(roomState.users);

    if (roomState.video_url) {
        const shouldLoad = getLastLoadedUrl() !== roomState.video_url;

        if (shouldLoad) {
            // Headerları normalize et
            const userAgent = roomState.user_agent || '';
            const referer = roomState.referer || '';

            // UI Inputlarını Güncelle
            const urlInput = document.getElementById('video-url-input');
            const uaInput = document.getElementById('custom-user-agent');
            const refInput = document.getElementById('custom-referer');
            const subInput = document.getElementById('subtitle-url');

            if (urlInput) urlInput.value = roomState.video_url || '';
            if (uaInput) uaInput.value = userAgent;
            if (refInput) refInput.value = referer;
            if (subInput) subInput.value = roomState.subtitle_url || '';

            await loadVideo(
                roomState.video_url, 
                roomState.video_format, 
                userAgent,
                referer,
                roomState.video_title, 
                roomState.subtitle_url
            );
        }

        await applyState(roomState);
    } else {
        // Video yoksa ve kullanıcı host ise controls-toggle'ı aç
        const currentUser = roomState.users?.find(u => u.username === state.currentUser?.username);
        if (currentUser?.is_host) {
            const inputContainer = document.getElementById('video-input-container');
            const toggleBtn = document.querySelector('.controls-toggle');

            if (inputContainer && (inputContainer.style.display === 'none' || window.getComputedStyle(inputContainer).display === 'none')) {
                inputContainer.style.display = 'block';
                if (toggleBtn) toggleBtn.classList.add('active');
            }
        }
    }

    if (roomState.chat_messages) {
        loadChatHistory(roomState.chat_messages);
    }
};

const handleUserJoined = (msg) => {
    updateUsersList(msg.users);
    addSystemMessage(`${msg.avatar} ${msg.username} odaya katıldı`);
    showToast(`${msg.username} odaya katıldı`, 'info');
};

const handleUserLeft = (msg) => {
    updateUsersList(msg.users);
    addSystemMessage(`${msg.username} odadan ayrıldı`);
};

const handleChatMessage = (msg) => {
    addChatMessage(msg.username, msg.avatar, msg.message, msg.timestamp);
};

// Typing indicator handler
const handleTypingIndicator = (msg) => {
    showTypingIndicator(msg.username);
};

const handleVideoChanged = async (msg) => {
    // Headerları normalize et
    const userAgent = msg.user_agent || '';
    const referer = msg.referer || '';

    // UI Inputlarını Güncelle (Stream)
    const urlInput = document.getElementById('video-url-input');
    const uaInput = document.getElementById('custom-user-agent');
    const refInput = document.getElementById('custom-referer');
    const subInput = document.getElementById('subtitle-url');

    if (urlInput) urlInput.value = msg.url || '';
    if (uaInput) uaInput.value = userAgent;
    if (refInput) refInput.value = referer;
    if (subInput) subInput.value = msg.subtitle_url || '';

    await loadVideo(msg.url, msg.format, userAgent, referer, msg.title, msg.subtitle_url);
    updateVideoInfo(msg.title, msg.duration);
    showToast(`${msg.changed_by || 'Birisi'} yeni video yükledi`, 'info');
    addSystemMessage(`🎥 Yeni video: ${msg.title || 'Video'}`);

    // Close input container after video loads successfully
    const inputContainer = document.getElementById('video-input-container');
    if (inputContainer && inputContainer.style.display !== 'none') {
        inputContainer.style.display = 'none';
        const toggleBtn = document.querySelector('.controls-toggle');
        if (toggleBtn) toggleBtn.classList.remove('active');
    }
};

// ============== Player Callbacks ==============
const setupPlayerCallbacks = () => {
    setPlayerCallbacks({
        onPlay: (time) => send('play', { time }),
        onPause: (time) => send('pause', { time }),
        onSeek: (time) => send('seek', { time }),
        onBufferStart: () => send('buffer_start'),
        onBufferEnd: () => send('buffer_end'),
        onSyncRequest: () => send('get_state')
    });
};

// ============== Heartbeat ==============
const setupHeartbeat = () => {
    // Setup heartbeat with video time
    setHeartbeatDataProvider(() => {
        // Her zaman current_time gönder (paused durumda bile)
        // Backend drift hesaplamak için buna ihtiyaç duyuyor
        return {
            current_time: getCurrentTime()
        };
    });
};

// ============== User Actions (Global) ==============
const setupGlobalActions = () => {
    // Change video
    window.changeVideo = () => {
        const urlInput = document.getElementById('video-url-input');
        const userAgent = document.getElementById('custom-user-agent')?.value.trim() || '';
        const referer = document.getElementById('custom-referer')?.value.trim() || '';
        const subtitleUrl = document.getElementById('subtitle-url')?.value.trim() || '';
        const url = urlInput?.value.trim() || '';

        if (!url) {
            showToast("Lütfen bir video URL'si girin", 'warning');
            return;
        }

        showLoadingOverlay('player-container');
        send('video_change', { url, user_agent: userAgent, referer, subtitle_url: subtitleUrl });
    };

    // Send chat message
    window.sendMessage = (event) => {
        event.preventDefault();
        const input = document.getElementById('chat-input');
        const message = input?.value.trim() || '';
        if (!message) return;

        send('chat', { message });
        if (input) input.value = '';
    };

    // Copy room link
    window.copyRoomLink = copyRoomLink;

    // Toggle advanced options
    window.toggleAdvancedOptions = () => {
        toggleElement('advanced-options');
    };

    // Toggle controls
    window.toggleControls = (btn) => {
        const isVisible = toggleElement('video-input-container');
        if (btn) {
            btn.classList.toggle('active', isVisible);
        }
    };

    // Export room as shareable link
    window.exportRoom = async () => {
        const url = document.getElementById('video-url-input')?.value.trim() || '';
        if (!url) {
            showToast("Önce bir video URL'si girin", 'warning');
            return;
        }

        // Generate new random room ID
        const newRoomId = crypto.randomUUID().slice(0, 8).toUpperCase();
        const title = document.getElementById('video-title')?.textContent?.trim() || '';
        const userAgent = document.getElementById('custom-user-agent')?.value?.trim() || '';
        const referer = document.getElementById('custom-referer')?.value?.trim() || '';
        const subtitle = document.getElementById('subtitle-url')?.value?.trim() || '';

        // Build shareable URL with new room ID
        const params = new URLSearchParams();
        params.append('url', url);
        if (title) params.append('title', title);
        if (userAgent) params.append('user_agent', userAgent);
        if (referer) params.append('referer', referer);
        if (subtitle) params.append('subtitle', subtitle);

        const shareUrl = `${window.location.origin}/watch-party/${newRoomId}?${params.toString()}`;

        try {
            await navigator.clipboard.writeText(shareUrl);
            showToast('Yeni oda linki kopyalandı!', 'success');
        } catch {
            // Fallback: show in prompt
            prompt('Oda linki:', shareUrl);
        }
    };
};

// ============== Initialize ==============
const init = async () => {
    console.log(
        "%ckeyiflerolsun",
        "background: #2B2A29; color: #EF7F1A; padding: 12px 25px; font-size: 18px; font-weight: 700; border-radius: 6px; text-shadow: 0 2px 4px rgba(0,0,0,0.4); display: block;",
    );
    console.log(
        "%ciletişim: https://t.me/keyiflerolsun",
        "background: #1c1c1c; color: #ccc; padding: 10px 15px; font-size: 14px; border-radius: 6px; margin-top: 4px; display: block;"
    );

    // Go servislerini tespit et (fallback için)
    await detectGoServices();

    // Init modules
    initUI();
    initChat();
    initPlayer();

    // Generate user
    state.currentUser = generateRandomUser();
    setCurrentUsername(state.currentUser.username);

    // Setup
    setupMessageHandlers();
    setupPlayerCallbacks();
    setupVideoEventListeners();
    setupHeartbeat();
    setupGlobalActions();

    // Setup typing indicator
    const chatInput = document.getElementById('chat-input');
    let typingTimeout = null;
    if (chatInput) {
        chatInput.addEventListener('input', () => {
            // Throttle: 1 saniyede bir typing eventi gönder
            if (!typingTimeout) {
                send('typing');
                typingTimeout = setTimeout(() => {
                    typingTimeout = null;
                }, 1000);
            }
        });
    }

    // Connect
    const { wsUrl } = getRoomConfig();
    try {
        await connect(wsUrl);
        send('join', {
            username: state.currentUser.username,
            avatar: state.currentUser.avatar
        });

        // Autoload video if parameters exist
        if (window.AUTOLOAD?.url) {
            const { url, title, user_agent, referer, subtitle } = window.AUTOLOAD;

            // Show input container
            const inputContainer = document.getElementById('video-input-container');
            if (inputContainer) {
                inputContainer.style.display = 'block';
                // Toggle button'u aktif yap
                const toggleBtn = document.querySelector('.controls-toggle');
                if (toggleBtn) toggleBtn.classList.add('active');
            }

            // Fill form inputs
            const urlInput = document.getElementById('video-url-input');
            const uaInput = document.getElementById('custom-user-agent');
            const refInput = document.getElementById('custom-referer');
            const subInput = document.getElementById('subtitle-url');

            if (urlInput) urlInput.value = url;
            if (uaInput && user_agent) uaInput.value = user_agent;
            if (refInput && referer) refInput.value = referer;
            if (subInput && subtitle) subInput.value = subtitle;

            // Show advanced options if any advanced field is filled
            if (user_agent || referer || subtitle) {
                const advancedOptions = document.getElementById('advanced-options');
                if (advancedOptions) advancedOptions.style.display = '';
            }

            // Trigger video change after small delay (wait for room state)
            setTimeout(() => {
                showLoadingOverlay('player-container');
                send('video_change', { 
                    url, 
                    title: title || '', 
                    user_agent: user_agent || '', 
                    referer: referer || '', 
                    subtitle_url: subtitle || '' 
                });
            }, 500);

            // Clean URL parameters
            const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        }
    } catch (e) {
        console.error('Connection failed:', e);
    }
};

// Start app when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
