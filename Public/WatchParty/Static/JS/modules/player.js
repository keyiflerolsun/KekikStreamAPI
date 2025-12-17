// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { formatTime, formatDuration, logger } from './utils.min.js';
import { showToast, updateSyncInfoText, hideSkeleton } from './ui.min.js';

// ============== Player States ==============
const PlayerState = {
    IDLE: 'idle',
    LOADING: 'loading',
    WAITING_INTERACTION: 'waiting_interaction',
    READY: 'ready',
    PLAYING: 'playing'
};

// ============== State ==============
const state = {
    videoPlayer: null,
    playerOverlay: null,
    videoInfo: null,
    videoTitle: null,
    videoDuration: null,
    hls: null,
    lastLoadedUrl: null,
    playerState: PlayerState.IDLE,
    syncInterval: null,
    isSyncing: false  // Prevents event broadcasts during sync operations
};

// ============== Callbacks ==============
const callbacks = {
    onPlay: null,
    onPause: null,
    onSeek: null,
    onBufferStart: null,
    onBufferEnd: null,
    onSyncRequest: null
};

// ============== Initialization ==============
export const initPlayer = () => {
    state.videoPlayer = document.getElementById('video-player');
    state.playerOverlay = document.getElementById('player-overlay');
    state.videoInfo = document.getElementById('video-info');
    state.videoTitle = document.getElementById('video-title');
    state.videoDuration = document.getElementById('video-duration');
};

export const setPlayerCallbacks = (cbs) => {
    Object.assign(callbacks, cbs);
};

// ============== Video Event Listeners ==============
export const setupVideoEventListeners = () => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    const shouldIgnoreEvent = () => {
        return state.isSyncing || 
               // Ignore if just loading
               state.playerState === PlayerState.LOADING;
    };

    videoPlayer.addEventListener('play', () => {
        // Add video-playing class for mobile UX
        document.body.classList.add('video-playing');
        
        if (shouldIgnoreEvent()) return;
        if (state.playerState !== PlayerState.READY) return;

        state.playerState = PlayerState.PLAYING;
        callbacks.onPlay?.(videoPlayer.currentTime);
    });

    videoPlayer.addEventListener('pause', () => {
        // Remove video-playing class
        document.body.classList.remove('video-playing');
        
        if (shouldIgnoreEvent()) return;
        if (state.playerState !== PlayerState.PLAYING) return;
        if (videoPlayer.ended) return;

        state.playerState = PlayerState.READY;
        callbacks.onPause?.(videoPlayer.currentTime);
    });

    videoPlayer.addEventListener('seeked', () => {
        if (shouldIgnoreEvent()) return;
        if (state.playerState !== PlayerState.PLAYING && state.playerState !== PlayerState.READY) return;
        
        callbacks.onSeek?.(videoPlayer.currentTime);
    });

    videoPlayer.addEventListener('waiting', () => {
        if (state.playerState !== PlayerState.PLAYING) return;
        callbacks.onBufferStart?.();
    });

    videoPlayer.addEventListener('playing', () => {
        if (state.playerState === PlayerState.WAITING_INTERACTION) return;
        callbacks.onBufferEnd?.();
    });
};

// ============== Helpers ==============
const waitForSeek = async (timeout = 5000) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    return new Promise(resolve => {
        let resolved = false;

        const onSeeked = () => {
            if (resolved) return;
            resolved = true;
            resolve(true);
        };

        videoPlayer.addEventListener('seeked', onSeeked, { once: true });

        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                videoPlayer.removeEventListener('seeked', onSeeked);
                logger.video('Seek timeout - continuing anyway');
                resolve(false);
            }
        }, timeout);
    });
};

// ============== Safe Play Helper ==============
const safePlay = async (timeout = 3000) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return { success: false, error: 'No video player' };

    try {
        const playPromise = videoPlayer.play();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Play timeout')), timeout)
        );
        
        await Promise.race([playPromise, timeoutPromise]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e };
    }
};

// ============== Proxy URL Builder ==============
const buildProxyUrl = (url, headers = {}, endpoint = 'video') => {
    const params = new URLSearchParams();
    params.append('url', url);
    
    // Headerları ayrıştır
    const userAgent = headers['User-Agent'] || headers['user-agent'];
    const referer = headers['Referer'] || headers['referer'];
    
    if (userAgent) params.append('user_agent', userAgent);
    if (referer) params.append('referer', referer);
    
    return `/proxy/${endpoint}?${params.toString()}`;
};

// ============== Format Detection ==============
const detectFormat = (url, format) => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('.m3u8') || lowerUrl.includes('/hls/') || format === 'hls') return 'hls';
    if (lowerUrl.includes('.mp4') || lowerUrl.includes('/mp4/') || format === 'mp4') return 'mp4';
    if (lowerUrl.includes('.webm') || format === 'webm') return 'webm';
    return format || 'native';
};

// ============== HLS Loading ==============
const loadHls = (url, headers = {}, useProxy = false) => {
    return new Promise((resolve) => {
        const { videoPlayer } = state;
        
        if (state.hls) {
            state.hls.destroy();
            state.hls = null;
        }

        const isProxyEnabled = window.PROXY_ENABLED !== false;
        
        const hlsConfig = {
            debug: false,
            enableWorker: true,
            capLevelToPlayerSize: true,
            maxLoadingDelay: 4,
            minAutoBitrate: 0,
            xhrSetup: (!useProxy && !isProxyEnabled) ? undefined : (xhr, requestUrl) => {
                // Eğer zaten proxy URL'i ise dokunma
                if (requestUrl.includes('/proxy/video')) {
                    return;
                }

                // Tüm istekleri proxy üzerinden yönlendir
                // Backend HLS manifest URL'lerini otomatik olarak yeniden yazıyor
                try {
                    const proxyUrl = buildProxyUrl(requestUrl, headers, 'video');
                    xhr.open('GET', proxyUrl, true);
                } catch (e) {
                    console.error('HLS Proxy Error:', e);
                    xhr.open('GET', buildProxyUrl(requestUrl, headers, 'video'), true);
                }
            }
        };

        state.hls = new Hls(hlsConfig);
        
        const loadUrl = useProxy ? buildProxyUrl(url, headers, 'video') : url;
        
        logger.video(`HLS: ${useProxy ? 'proxy (forced)' : 'smart-proxy'}`);
        
        state.hls.loadSource(loadUrl);
        state.hls.attachMedia(videoPlayer);

        let resolved = false;
        let retryCount = 0;
        const maxRetries = 3;

        state.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!resolved) {
                resolved = true;
                logger.success('HLS OK');
                resolve(true);
            }
        });

        state.hls.on(Hls.Events.ERROR, async (_, data) => {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        retryCount++;
                        logger.video(`HLS Network Error (Retry ${retryCount}/${maxRetries})`);
                        
                        if (retryCount <= maxRetries) {
                            state.hls.startLoad();
                        } else if (!useProxy && !resolved && window.PROXY_ENABLED !== false) {
                             // İlk deneme başarısızsa ve henüz proxy zorlanmadıysa (ve proxy aktifse)
                             logger.video('Switching to forced proxy mode...');
                             resolved = true; // Mevcut promise resolve olmasın diye flag'i kitle
                             state.hls.destroy();
                             const result = await loadHls(url, headers, true); // Recursive call with forced proxy
                             resolve(result); // Resolve original promise with result
                        } else {
                            if (!resolved) {
                                resolved = true;
                                showToast(`HLS Hatası: ${data.details}`, 'error');
                                resolve(false);
                            }
                        }
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        logger.video('HLS Media Error - Recovering...');
                        state.hls.recoverMediaError();
                        break;
                    default:
                        if (!resolved) {
                            resolved = true;
                            state.hls.destroy();
                            resolve(false);
                        }
                        break;
                }
            }
        });
    });
};

// ============== Native Video Loading ==============
const loadNative = (url, headers = {}, useProxy = false) => {
    return new Promise((resolve) => {
        const { videoPlayer } = state;
        const loadUrl = useProxy ? buildProxyUrl(url, headers, 'video') : url;
        videoPlayer.src = loadUrl;

        const onCanPlay = () => {
            cleanup();
            resolve(true);
        };

        const onError = async () => {
            cleanup();
            if (!useProxy && window.PROXY_ENABLED !== false) {
                const result = await loadNative(url, headers, true);
                resolve(result);
            } else {
                showToast('Video yüklenemedi', 'error');
                resolve(false);
            }
        };

        const cleanup = () => {
            videoPlayer.removeEventListener('canplay', onCanPlay);
            videoPlayer.removeEventListener('error', onError);
        };

        videoPlayer.addEventListener('canplay', onCanPlay, { once: true });
        videoPlayer.addEventListener('error', onError, { once: true });
        
        setTimeout(() => {
            if (videoPlayer.readyState >= 2) {
                cleanup();
                resolve(true);
            }
        }, 5000);
    });
};

// ============== Load Video ==============
export const loadVideo = async (url, format = 'hls', headers = {}, title = '', subtitleUrl = '') => {
    const { videoPlayer, playerOverlay, videoInfo, videoTitle: titleEl } = state;
    if (!videoPlayer || !playerOverlay) return false;

    state.playerState = PlayerState.LOADING;
    
    // Hide export button until video loads successfully
    const exportBtn = document.getElementById('export-room-btn');
    if (exportBtn) exportBtn.style.display = 'none';
    
    // Cleanup
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }
    videoPlayer.querySelectorAll('track').forEach(t => t.remove());
    playerOverlay.classList.add('hidden');
    hideSkeleton('player-container');

    // Content-Type Pre-check (via Proxy HEAD)
    let detectedFormat = format;
    if (window.PROXY_ENABLED !== false) {
        try {
            const proxyUrl = buildProxyUrl(url, headers, 'video');
            const headRes = await fetch(proxyUrl, { method: 'HEAD' });
            const contentType = headRes.headers.get('content-type') || '';
            
            if (contentType.includes('mpegurl') || contentType.includes('mpeg')) {
                detectedFormat = 'hls';
            } else if (contentType.includes('mp4')) {
                detectedFormat = 'mp4';
            }
            logger.video(`Format check: ${contentType} -> ${detectedFormat}`);
        } catch (e) {
            logger.video('Format check failed, falling back to extension detection');
            detectedFormat = detectFormat(url, format);
        }
    } else {
         detectedFormat = detectFormat(url, format);
    }

    let success = false;
    if (detectedFormat === 'hls' && typeof Hls !== 'undefined' && Hls.isSupported()) {
        success = await loadHls(url, headers, false);
    } else {
        success = await loadNative(url, headers, false);
    }

    // Subtitle
    if (subtitleUrl) {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'Türkçe';
        track.srclang = 'tr';
        // Subtitle (Smart)
        if (window.PROXY_ENABLED !== false) {
             track.src = buildProxyUrl(subtitleUrl, headers, 'subtitle');
        } else {
             track.src = subtitleUrl;
        }
        track.default = true;
        videoPlayer.appendChild(track);
    }

    // Title
    if (title && titleEl && videoInfo) {
        titleEl.textContent = title;
        videoInfo.style.display = 'block';
    }

    state.lastLoadedUrl = url;
    state.playerState = success ? PlayerState.READY : PlayerState.IDLE;
    
    // Show export button if video loaded successfully
    if (success) {
        const exportBtn = document.getElementById('export-room-btn');
        if (exportBtn) exportBtn.style.display = '';
    }
    
    return success;
};

// ============== Show Interaction Prompt ==============
export const showInteractionPrompt = () => {
    const { playerOverlay, videoPlayer } = state;
    if (!playerOverlay || !videoPlayer) return;
    if (state.playerState === PlayerState.WAITING_INTERACTION) return; // Already showing

    state.playerState = PlayerState.WAITING_INTERACTION;
    
    playerOverlay.classList.remove('hidden');
    playerOverlay.innerHTML = `
        <div class="wp-player-message" style="cursor: pointer;">
            <i class="fa-solid fa-circle-play" style="font-size: 4rem; color: var(--wp-primary); margin-bottom: 1rem;"></i>
            <p>Yayına Katılmak İçin Tıklayın</p>
        </div>
    `;

    // Start sync interval
    stopSyncInterval();
    if (callbacks.onSyncRequest) {
        state.syncInterval = setInterval(() => {
            callbacks.onSyncRequest();
        }, 1000);
    }

    const handleClick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        stopSyncInterval();
        playerOverlay.removeEventListener('click', handleClick);
        playerOverlay.removeEventListener('touchend', handleClick);
        playerOverlay.classList.add('hidden');
        
        state.isSyncing = true;  // Prevent event broadcasts
        const result = await safePlay();
        
        if (result.success) {
            state.playerState = PlayerState.PLAYING;
        } else {
            state.playerState = PlayerState.READY;
            if (result.error?.message === 'Play timeout') {
                showToast('Video yüklenemedi', 'warning');
            } else if (result.error?.name !== 'AbortError') {
                showToast('Oynatma hatası', 'error');
            }
        }
        state.isSyncing = false;
    };

    playerOverlay.addEventListener('click', handleClick);
    playerOverlay.addEventListener('touchend', handleClick, { passive: false });
};

const stopSyncInterval = () => {
    if (state.syncInterval) {
        clearInterval(state.syncInterval);
        state.syncInterval = null;
    }
};

// ============== Apply Initial State ==============
export const applyState = async (serverState) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    state.isSyncing = true;
    
    // Seek to server time
    logger.sync(`State: ${serverState.current_time.toFixed(1)}s, playing=${serverState.is_playing}`);
    videoPlayer.currentTime = serverState.current_time;

    if (serverState.is_playing) {
        const result = await safePlay();
        
        if (result.success) {
            state.playerState = PlayerState.PLAYING;
        } else if (result.error?.name === 'NotAllowedError') {
            state.isSyncing = false;
            showInteractionPrompt();
            return;
        }
    } else {
        videoPlayer.pause();
        state.playerState = PlayerState.READY;
    }
    
    state.isSyncing = false;
};

// ============== Handle Sync (from other users) ==============
export const handleSync = async (msg) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    // If waiting for interaction, just update time silently
    if (state.playerState === PlayerState.WAITING_INTERACTION) {
        videoPlayer.currentTime = msg.current_time;
        return;
    }

    // If loading, ignore
    if (state.playerState === PlayerState.LOADING) return;

    state.isSyncing = true;
    
    const timeDiff = Math.abs(videoPlayer.currentTime - msg.current_time);
    
    // Adjust time if needed
    if (timeDiff > 0.5) {
        logger.sync(`Adjustment: ${timeDiff.toFixed(2)}s`);
        videoPlayer.currentTime = msg.current_time;
        
        // Wait for seek to complete (with longer timeout)
        await waitForSeek();
    }

    // Sync play/pause state
    if (msg.is_playing) {
        if (videoPlayer.paused) {
            const result = await safePlay();
            if (result.success) {
                state.playerState = PlayerState.PLAYING;
            } else if (result.error?.name === 'NotAllowedError') {
                state.isSyncing = false;
                showInteractionPrompt();
                return;
            }
        } else {
            // Already playing, ensure state is consistent
            state.playerState = PlayerState.PLAYING;
        }
    } else {
        if (!videoPlayer.paused) {
            videoPlayer.pause();
        }
        // Always update state when paused
        state.playerState = PlayerState.READY;
    }

    state.isSyncing = false;
    updateSyncInfoText(msg.triggered_by, msg.is_playing ? 'oynatıyor' : 'durdurdu');
};

// ============== Handle Seek (from other users) ==============
export const handleSeek = async (msg) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;
    if (state.playerState === PlayerState.LOADING) return;
    if (state.playerState === PlayerState.WAITING_INTERACTION) {
        videoPlayer.currentTime = msg.current_time;
        return;
    }

    const timeDiff = Math.abs(videoPlayer.currentTime - msg.current_time);

    // Only seek if difference is significant (prevents echo loops and stuck states)
    if (timeDiff > 0.5) {
        state.isSyncing = true;
        videoPlayer.currentTime = msg.current_time;
        
        // Wait for seek to complete
        await waitForSeek();
        state.isSyncing = false;
    }

    // Sync play/pause state if provided
    if (msg.is_playing !== undefined) {
        if (msg.is_playing && videoPlayer.paused) {
            const result = await safePlay();
            if (result.success) {
                state.playerState = PlayerState.PLAYING;
            }
        } else if (!msg.is_playing && !videoPlayer.paused) {
            videoPlayer.pause();
            state.playerState = PlayerState.READY;
        }
    }
    
    updateSyncInfoText(msg.triggered_by, `${formatTime(msg.current_time)} konumuna atladı`);
};

// ============== Handle Sync Correction (from server heartbeat) ==============
export const handleSyncCorrection = async (msg) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    // Skip if not playing
    if (state.playerState !== PlayerState.PLAYING) return;

    state.isSyncing = true;
    
    if (msg.action === 'rate') {
        const rate = msg.rate || 1.0;
        if (Math.abs(videoPlayer.playbackRate - rate) > 0.01) {
            logger.sync(`Rate: ${rate}x (drift: ${msg.drift.toFixed(2)}s)`);
            videoPlayer.playbackRate = rate;
        }
    } else if (msg.action === 'buffer') {
        logger.sync(`Buffer sync: ${msg.target_time.toFixed(1)}s`);
        
        videoPlayer.pause();
        showToast('Senkronize ediliyor...', 'warning');
        videoPlayer.currentTime = msg.target_time;
        
        // Wait for seek
        await waitForSeek();
        
        await safePlay();
        videoPlayer.playbackRate = 1.0;
    }
    
    state.isSyncing = false;
};

// ============== Getters ==============
export const getCurrentTime = () => state.videoPlayer?.currentTime || 0;
export const isPlaying = () => state.playerState === PlayerState.PLAYING;
export const getLastLoadedUrl = () => state.lastLoadedUrl;

// ============== Setters ==============
export const updateVideoInfo = (title, duration) => {
    if (state.videoTitle && title) state.videoTitle.textContent = title;
    if (state.videoDuration && duration) state.videoDuration.textContent = formatDuration(duration);
    if (state.videoInfo) state.videoInfo.style.display = 'block';
};
