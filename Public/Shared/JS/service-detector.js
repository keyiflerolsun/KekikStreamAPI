// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

// ============== Go Service Detector ==============
// Detects if Go services are available, provides fallback to Python

const state = {
    proxyAvailable: null,  // null = not checked, true/false = result
    wsAvailable: null,
    checking: false
};

// Check if Go Proxy service is available
const checkProxyHealth = async () => {
    try {
        const configUrl = window.CONFIG?.proxy_url || ':3311';
        const baseUrl = configUrl.startsWith(':') 
            ? `${window.location.protocol}//${window.location.hostname}${configUrl}`
            : configUrl;
        
        const url = `${baseUrl.replace(/\/$/, '')}/health`;
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
        return response.ok;
    } catch {
        return false;
    }
};

// Check if Go WebSocket service is available
const checkWsHealth = async () => {
    try {
        const configUrl = window.CONFIG?.ws_url || ':3312';
        const baseUrl = configUrl.startsWith(':') 
            ? `${window.location.protocol}//${window.location.hostname}${configUrl}`
            : configUrl;

        // WebSocket URL'i http/https'e çevir health check için
        const checkUrl = baseUrl.replace(/^ws/, 'http').replace(/\/$/, '') + '/health';
        const response = await fetch(checkUrl, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
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
    const configUrl = window.CONFIG?.proxy_url || ':3311';
    const goBaseUrl = configUrl.startsWith(':') 
        ? `${window.location.protocol}//${window.location.hostname}${configUrl}`
        : configUrl.replace(/\/$/, '');

    // window.GO_PROXY_AVAILABLE global değişkeni sayfa yüklendiğinde ayarlanır
    if (state.proxyAvailable === true) {
        return goBaseUrl;
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
    const configUrl = window.CONFIG?.ws_url || ':3312';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    const goWsUrl = configUrl.startsWith(':') 
        ? `${protocol}//${window.location.hostname}${configUrl}/wss/watch_party/${roomId}`
        : `${configUrl.replace(/\/$/, '')}/wss/watch_party/${roomId}`;

    if (state.wsAvailable === true) {
        return goWsUrl;
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
