// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

// ============== Go Service Detector ==============
// Detects if Go services are available, provides fallback to Python

const GO_PROXY_PORT = 3311;
const GO_WS_PORT = 3312;

const state = {
    proxyAvailable: null,  // null = not checked, true/false = result
    wsAvailable: null,
    checking: false
};

// Check if Go Proxy service is available
const checkProxyHealth = async () => {
    try {
        const url = `${window.location.protocol}//${window.location.hostname}:${GO_PROXY_PORT}/health`;
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
        return response.ok;
    } catch {
        return false;
    }
};

// Check if Go WebSocket service is available
const checkWsHealth = async () => {
    try {
        const url = `${window.location.protocol}//${window.location.hostname}:${GO_WS_PORT}/health`;
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
        return response.ok;
    } catch {
        return false;
    }
};

// Detect all Go services (call on page load)
export const detectGoServices = async () => {
    if (state.checking) return;
    state.checking = true;
    
    try {
        const [proxyOk, wsOk] = await Promise.all([checkProxyHealth(), checkWsHealth()]);
        state.proxyAvailable = proxyOk;
        state.wsAvailable = wsOk;
        
    const proxyStatus = proxyOk ? '✅ Go' : '⚠️ Python';
        const wsStatus = wsOk ? '✅ Go' : '⚠️ Python';
        
        console.log(
            `%c[🔌 SERVICE]%c Proxy: ${proxyStatus}, WS: ${wsStatus}`,
            'color: #a855f7; font-weight: bold;',
            ''
        );
    } finally {
        state.checking = false;
    }
};

// Get Proxy base URL (Go or Python fallback)
export const getProxyBaseUrl = () => {
    if (state.proxyAvailable === true) {
        return `${window.location.protocol}//${window.location.hostname}:${GO_PROXY_PORT}`;
    }
    // Fallback to Python (same origin)
    return window.location.origin;
};

// Build full proxy URL for video/subtitle
export const buildProxyUrl = (url, userAgent = '', referer = '', endpoint = 'video') => {
    const params = new URLSearchParams();
    params.append('url', url);
    if (userAgent) params.append('user_agent', userAgent);
    if (referer) params.append('referer', referer);
    
    return `${getProxyBaseUrl()}/proxy/${endpoint}?${params.toString()}`;
};

// Get WebSocket URL (Go or Python fallback)
export const getWebSocketUrl = (roomId) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    if (state.wsAvailable === true) {
        return `${protocol}//${window.location.hostname}:${GO_WS_PORT}/wss/watch_party/${roomId}`;
    }
    // Fallback to Python (same origin)
    return `${protocol}//${window.location.host}/wss/watch_party/${roomId}`;
};

// Check if Go services are being used
export const isUsingGoProxy = () => state.proxyAvailable === true;
export const isUsingGoWs = () => state.wsAvailable === true;

// Force recheck (useful after connection errors)
export const recheckServices = () => {
    state.proxyAvailable = null;
    state.wsAvailable = null;
    return detectGoServices();
};
