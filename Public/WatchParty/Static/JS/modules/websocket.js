// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { sleep } from './utils.min.js';
import { showToast, updateSyncStatus, showConnectionModal, hideConnectionModal, updatePing } from './ui.min.js';
import { setWebSocketRef, getCurrentTime, isSyncing } from './player-core.min.js';

// ============== Config ==============
const config = {
    maxReconnectAttempts: 5,
    reconnectDelay: 3000,
    heartbeatInterval: 1000  // 1s için hızlı stall detection
};

// ============== State ==============
const state = {
    ws: null,
    isConnected: false,
    reconnectAttempts: 0,
    heartbeatInterval: null,
    getHeartbeatData: null,
    reconnectTimer: null,      // Duplicate reconnect önleme
    initialConnectDone: false  // İlk bağlantı için resolve/reject
};

// Ping tracking
state.pingCounter = 0;
state.pendingPings = new Map();

// ============== Message Handlers ==============
const messageHandlers = new Map();

export const onMessage = (type, handler) => {
    messageHandlers.set(type, handler);
};

export const setHeartbeatDataProvider = (fn) => {
    state.getHeartbeatData = fn;
};

export const connect = async (url) => {
    // CONNECTING state'inde de guard'la (race condition önleme)
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return;

    updateSyncStatus('connecting');

    // Önceki reconnect timer'ı iptal et
    if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
    }

    return new Promise((resolve, reject) => {
        state.ws = new WebSocket(url);
        setWebSocketRef(state.ws);

        state.ws.onopen = () => {
            state.isConnected = true;
            state.reconnectAttempts = 0;
            // Eski ping kayıtlarını temizle
            state.pendingPings.clear();
            state.pingCounter = 0;
            updateSyncStatus('connected');
            hideConnectionModal();
            startHeartbeat();
            
            // Sadece ilk bağlantıda resolve et
            if (!state.initialConnectDone) {
                state.initialConnectDone = true;
                resolve();
            }
        };

        state.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (e) {
                console.error('Failed to parse message:', e);
            }
        };

        state.ws.onclose = async () => {
            state.isConnected = false;
            stopHeartbeat();
            // Eski ping kayıtlarını temizle (reconnect sonrası yanlış RTT önleme)
            state.pendingPings.clear();
            updateSyncStatus('disconnected');

            if (state.reconnectAttempts < config.maxReconnectAttempts) {
                state.reconnectAttempts++;
                showConnectionModal();
                
                // Önceki timer'ı iptal et (duplicate reconnect önleme)
                if (state.reconnectTimer) {
                    clearTimeout(state.reconnectTimer);
                }
                state.reconnectTimer = setTimeout(() => {
                    state.reconnectTimer = null;
                    connect(url);  // void - yeni Promise dönmez
                }, config.reconnectDelay);
            } else {
                showToast('Bağlantı kurulamadı. Lütfen sayfayı yenileyin.', 'error');
                // Sadece ilk bağlantı başarısızsa reject et
                if (!state.initialConnectDone) {
                    reject(new Error('Max reconnect attempts reached'));
                }
            }
        };

        state.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    });
};

const handleMessage = (message) => {
    if (message.type === 'pong') {
        // Ping ID'yi normalize et (Number ile)
        const id = Number(message._ping_id);
        if (id && state.pendingPings.has(id)) {
            const sent = state.pendingPings.get(id);
            const rtt = Date.now() - sent;
            state.pendingPings.delete(id);
            try { updatePing(rtt); } catch (e) { /* ignore UI errors */ }
            return;
        }

        // Fallback: if server returned a bare pong (no id), match the oldest pending ping
        if (state.pendingPings.size > 0) {
            const oldest = [...state.pendingPings.entries()].sort((a, b) => a[1] - b[1])[0];
            if (oldest) {
                const [oldId, sent] = oldest;
                const rtt = Date.now() - sent;
                state.pendingPings.delete(oldId);
                try { updatePing(rtt); } catch (e) { /* ignore UI errors */ }
                return;
            }
        }

        // If nothing to match, show no-value
        try { updatePing(null); } catch (e) {}
        return;
    }

    const handler = messageHandlers.get(message.type);
    if (handler) {
        handler(message);
    } else {
        console.warn('Unknown message type:', message.type);
    }
};

export const send = (type, data = {}) => {
    if (state.ws?.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type, ...data }));
    }
};

const startHeartbeat = () => {
    stopHeartbeat();
    state.heartbeatInterval = setInterval(() => {
        if (state.ws?.readyState === WebSocket.OPEN) {
            const payload = state.getHeartbeatData?.() || {};
            
            // Her zaman current_time gönder + syncing flag ekle
            // Server syncing=true iken drift/stall hesaplarını ignore edecek
            if (payload.current_time == null) {
                payload.current_time = getCurrentTime();
            }
            payload.syncing = isSyncing();
            
            // create a ping id and record timestamp
            // overflow prevention
            if (state.pingCounter > 1e9) state.pingCounter = 0;
            const id = ++state.pingCounter;
            state.pendingPings.set(id, Date.now());
            send('ping', { ...payload, _ping_id: id });
            // cleanup very old pings
            const now = Date.now();
            for (const [k, ts] of state.pendingPings.entries()) {
                if (now - ts > 10000) state.pendingPings.delete(k);
            }
        }
    }, config.heartbeatInterval);
};

const stopHeartbeat = () => {
    if (state.heartbeatInterval) {
        clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = null;
    }
};
