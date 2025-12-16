// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

// Module Imports
import { generateRandomUser } from './modules/utils.js';
import { initUI, showToast, copyRoomLink, toggleElement, showSkeleton } from './modules/ui.js';
import { initChat, addChatMessage, addSystemMessage, updateUsersList, loadChatHistory, setCurrentUsername } from './modules/chat.js';
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
} from './modules/player.js';
import { connect, send, onMessage, setHeartbeatDataProvider } from './modules/websocket.js';

// ============== State ==============
const state = {
    currentUser: null
};

// ============== Config ==============
const getRoomConfig = () => {
    const roomId = window.ROOM_ID || document.getElementById('room-id')?.textContent || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/wss/watch_party/${roomId}`;
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
    onMessage('video_changed', handleVideoChanged);
    onMessage('error', (msg) => showToast(msg.message, 'error'));
};

const handleRoomState = async (roomState) => {
    updateUsersList(roomState.users);

    if (roomState.video_url) {
        const shouldLoad = getLastLoadedUrl() !== roomState.video_url;

        if (shouldLoad) {
            // Headerları normalize et
            const headers = roomState.headers || {};
            const userAgent = roomState.user_agent || headers['User-Agent'] || headers['user-agent'] || '';
            const referer = roomState.referer || headers['Referer'] || headers['referer'] || '';
            
            if (userAgent) headers['User-Agent'] = userAgent;
            if (referer) headers['Referer'] = referer;
            
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
                headers, 
                roomState.video_title, 
                roomState.subtitle_url
            );
        }

        await applyState(roomState);
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

const handleVideoChanged = async (msg) => {
    showSkeleton('player-container');
    
    // Headerları normalize et
    const headers = msg.headers || {};
    const userAgent = msg.user_agent || headers['User-Agent'] || headers['user-agent'] || '';
    const referer = msg.referer || headers['Referer'] || headers['referer'] || '';
    
    if (userAgent) headers['User-Agent'] = userAgent;
    if (referer) headers['Referer'] = referer;
    
    // UI Inputlarını Güncelle (Stream)
    const urlInput = document.getElementById('video-url-input');
    const uaInput = document.getElementById('custom-user-agent');
    const refInput = document.getElementById('custom-referer');
    const subInput = document.getElementById('subtitle-url');

    if (urlInput) urlInput.value = msg.url || '';
    if (uaInput) uaInput.value = userAgent;
    if (refInput) refInput.value = referer;
    if (subInput) subInput.value = msg.subtitle_url || '';

    await loadVideo(msg.url, msg.format, headers, msg.title, msg.subtitle_url);
    updateVideoInfo(msg.title, msg.duration);
    showToast(`${msg.changed_by || 'Birisi'} yeni video yükledi`, 'info');
    addSystemMessage(`🎥 Yeni video: ${msg.title || 'Video'}`);
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
    setHeartbeatDataProvider(() => {
        const payload = {};
        if (isPlaying()) {
            payload.current_time = getCurrentTime();
        }
        return payload;
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

        showSkeleton('player-container');
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
        const userAgent = document.getElementById('custom-user-agent')?.value.trim() || '';
        const referer = document.getElementById('custom-referer')?.value.trim() || '';
        const subtitle = document.getElementById('subtitle-url')?.value.trim() || '';

        // Build shareable URL with new room ID
        const params = new URLSearchParams();
        params.append('url', url);
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
                inputContainer.style.display = '';
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
                showSkeleton('player-container');
                send('video_change', { 
                    url, 
                    title: title || '', 
                    user_agent: user_agent || '', 
                    referer: referer || '', 
                    subtitle_url: subtitle || '' 
                });
            }, 500);
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
