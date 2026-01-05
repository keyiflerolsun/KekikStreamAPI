// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { getProxyBaseUrl, buildProxyUrl } from './service-detector.min.js';

export const detectFormat = (url, format = null) => {
    const lowerUrl = url.toLowerCase();
    
    if (lowerUrl.includes('.m3u8') || lowerUrl.includes('/hls/') || lowerUrl.includes('/m3u8/') || format === 'hls') {
        return 'hls';
    }
    if (lowerUrl.includes('.mp4') || lowerUrl.includes('/mp4/') || format === 'mp4') {
        return 'mp4';
    }
    if (lowerUrl.includes('.webm') || format === 'webm') {
        return 'webm';
    }
    if (lowerUrl.includes('.mkv') || format === 'mkv') {
        return 'mkv';
    }
    
    return format || 'native';
};

export const parseRemoteUrl = (url) => {
    try {
        let remoteUrl = url;
        
        // Extract real URL from proxy wrapper
        if (url.includes('/proxy/video?url=')) {
            const match = url.match(/url=([^&]+)/);
            if (match) {
                remoteUrl = decodeURIComponent(match[1]);
            }
        }
        
        if (remoteUrl.startsWith('http')) {
            const urlObj = new URL(remoteUrl);
            return {
                origin: urlObj.origin,
                baseUrl: remoteUrl.substring(0, remoteUrl.lastIndexOf('/') + 1)
            };
        }
    } catch (e) {
        // Ignore parsing errors
    }
    
    return { origin: null, baseUrl: null };
};

export const createHlsXhrSetup = (userAgent, referer, context) => {
    return (xhr, requestUrl) => {
        // 1. Already a full proxy URL - extract and save base URL, don't re-proxy
        if (requestUrl.includes('/proxy/video?url=')) {
            const match = requestUrl.match(/url=([^&]+)/);
            if (match) {
                try {
                    const decodedUrl = decodeURIComponent(match[1]);
                    const proxyBase = getProxyBaseUrl();
                    let finalRemoteUrl = decodedUrl;
                    
                    // Handle nested proxy (error case)
                    if (decodedUrl.startsWith(proxyBase)) {
                        const innerMatch = decodedUrl.match(/\/proxy\/video\?url=([^&]+)/);
                        if (innerMatch) {
                            finalRemoteUrl = decodeURIComponent(innerMatch[1]);
                        }
                    }

                    if (finalRemoteUrl.startsWith('http')) {
                        context.lastLoadedBaseUrl = finalRemoteUrl.substring(0, finalRemoteUrl.lastIndexOf('/') + 1);
                        context.lastLoadedOrigin = new URL(finalRemoteUrl).origin;
                    }
                } catch (e) { /* ignore */ }
            }
            return; // Don't re-proxy
        }
        
        const proxyOrigin = getProxyBaseUrl();

        // 2. Incorrectly resolved absolute paths (manifest paths starting with /)
        if (requestUrl.startsWith(proxyOrigin) && !requestUrl.includes('/proxy/')) {
            const path = requestUrl.substring(proxyOrigin.length);
            if (context.lastLoadedOrigin) {
                const correctUrl = context.lastLoadedOrigin.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
                xhr.open('GET', buildProxyUrl(correctUrl, userAgent, referer, 'video'), true);
                return;
            }
        }

        // 3. Incorrectly resolved relative paths (manifest relative paths added to proxy address)
        if (requestUrl.includes('/proxy/') && !requestUrl.includes('/proxy/video?url=')) {
            const parts = requestUrl.split('/proxy/');
            const relativePath = parts[parts.length - 1];

            if (context.lastLoadedBaseUrl) {
                const correctUrl = context.lastLoadedBaseUrl.replace(/\/$/, '') + '/' + relativePath.replace(/^\//, '');
                xhr.open('GET', buildProxyUrl(correctUrl, userAgent, referer, 'video'), true);
                return;
            }
        }

        // 4. Normal URLs - wrap with proxy
        try {
            const proxyUrl = buildProxyUrl(requestUrl, userAgent, referer, 'video');
            
            // Save base URL if http
            if (requestUrl.startsWith('http')) {
                context.lastLoadedBaseUrl = requestUrl.substring(0, requestUrl.lastIndexOf('/') + 1);
                context.lastLoadedOrigin = new URL(requestUrl).origin;
            }
            
            xhr.open('GET', proxyUrl, true);
        } catch (e) {
            console.error('HLS Proxy Error:', e);
            xhr.open('GET', buildProxyUrl(requestUrl, userAgent, referer, 'video'), true);
        }
    };
};

export const createHlsConfig = (userAgent, referer, context, useProxy = null) => {
    const isProxyEnabled = useProxy ?? (window.PROXY_ENABLED !== false);
    
    return {
        debug: false,
        enableWorker: true,
        capLevelToPlayerSize: true,
        maxLoadingDelay: 4,
        minAutoBitrate: 0,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        startLevel: -1,
        xhrSetup: isProxyEnabled ? createHlsXhrSetup(userAgent, referer, context) : undefined
    };
};
