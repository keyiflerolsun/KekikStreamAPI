// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { formatDuration, logger } from './utils.min.js';
import { showToast, showLoadingOverlay, hideLoadingOverlay } from './ui.min.js';
import { buildProxyUrl } from '/static/shared/JS/service-detector.min.js';
import { flashOverlayElement } from '/static/shared/JS/dom-utils.min.js';
import { detectFormat, parseRemoteUrl, createHlsConfig } from '/static/shared/JS/video-utils.min.js';


// ============== Oynatıcı Durumları ==============
export const PlayerState = {
    IDLE: 'idle',
    LOADING: 'loading',
    WAITING_INTERACTION: 'waiting_interaction',
    READY: 'ready',
    PLAYING: 'playing'
};

// ============== Durum ==============
export const state = {
    videoPlayer: null,
    playerOverlay: null,
    videoInfo: null,
    videoTitle: null,
    videoDuration: null,
    hls: null,
    lastLoadedUrl: null,
    lastLoadedBaseUrl: null, // HLS segment URL'leri için base URL takibi
    lastLoadedOrigin: null, // HLS absolute path'leri için origin takibi
    playerState: PlayerState.IDLE,
    syncInterval: null,
    isSyncing: false,       // Senkronizasyon sırasında event yayınını engelle
    lastSeekTime: 0,        // Son seek zamanı - ön yüz seek debounce
    lastBufferEndTime: 0,   // Son buffer_end zamanı - ön yüz buffer debounce (event engelleme)
    ws: null,               // WebSocket instance ref
    lastSeekReadyEpoch: 0   // Son gönderilen seek_ready epoch
};

// ============== Geri Çağırma Fonksiyonları ==============
const callbacks = {
    onPlay: null,
    onPause: null,
    onSeek: null,
    onBufferStart: null,
    onBufferEnd: null,
    onSyncRequest: null
};

// ============== Başlatma ==============
export const initPlayer = () => {
    state.videoPlayer = document.getElementById('video-player');
    state.playerOverlay = document.getElementById('player-overlay');
    state.videoInfo = document.getElementById('video-info');
    state.videoTitle = document.getElementById('video-title');
    state.videoDuration = document.getElementById('video-duration');
    
    // Video element'in focus almasını engelle (native keyboard handling devre dışı)
    if (state.videoPlayer) {
        state.videoPlayer.tabIndex = -1;
    }
    
    // Mobil klavye açıldığında viewport resize için JS fallback
    // Brave ve bazı tarayıcılarda svh/dvh düzgün çalışmıyor
    setupViewportResizeHandler();
    
    // Player'a tıklanınca input focus'u kaldır (mobil klavye açılmasını engelle)
    setupPlayerClickHandler();
    
    // Masaüstü klavye kontrolleri (ok tuşları, space)
    setupKeyboardControls();
    
    // Mobil input focus handling - klavye açılınca alan genişlesin
    setupMobileInputFocusHandler();
};

// ============== Mobil Input Focus Handler ==============
const setupMobileInputFocusHandler = () => {
    const isMobile = () => window.innerWidth <= 1024;
    
    // Tüm wp-input alanlarını bul
    const setupInputHandler = (input) => {
        if (!input) return;
        
        input.addEventListener('focus', () => {
            if (!isMobile()) return;
            // Focus olunca video-playing class'ı ekle (alan genişlesin)
            document.body.classList.add('video-playing');
        });
        
        input.addEventListener('blur', () => {
            if (!isMobile()) return;
            // Blur olunca, video gerçekten oynamıyorsa class'ı kaldır
            const { videoPlayer } = state;
            const isActuallyPlaying = videoPlayer && !videoPlayer.paused;
            if (!isActuallyPlaying) {
                document.body.classList.remove('video-playing');
            }
        });
    };
    
    // Chat input
    const chatInput = document.getElementById('chat-input');
    setupInputHandler(chatInput);
    
    // Video URL input (varsa)
    const videoUrlInput = document.getElementById('video-url-input');
    setupInputHandler(videoUrlInput);
};

// ============== Klavye Kontrolleri (Masaüstü) ==============
const setupKeyboardControls = () => {
    const SEEK_STEP = 5; // 5 saniye ileri/geri
    
    document.addEventListener('keydown', (e) => {
        const { videoPlayer } = state;
        if (!videoPlayer) return;
        
        // Input/textarea içindeyse klavye kontrollerini devre dışı bırak
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            return;
        }
        
        // Video element focus'taysa, native keyboard handling'i engelle
        // (tarayıcı Space ile toggle yapmasın)
        if (activeEl === videoPlayer) {
            videoPlayer.blur();
        }
        
        // Video yüklenmediyse çık
        if (state.playerState === PlayerState.LOADING || state.playerState === PlayerState.IDLE) {
            return;
        }
        
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                if (videoPlayer.paused) {
                    videoPlayer.play();
                } else {
                    videoPlayer.pause();
                }
                break;
                
            case 'ArrowLeft':
                e.preventDefault();
                videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - SEEK_STEP);
                break;
                
            case 'ArrowRight':
                e.preventDefault();
                const duration = videoPlayer.duration || Infinity;
                videoPlayer.currentTime = Math.min(duration - 0.5, videoPlayer.currentTime + SEEK_STEP);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                videoPlayer.volume = Math.min(1, videoPlayer.volume + 0.1);
                break;
                
            case 'ArrowDown':
                e.preventDefault();
                videoPlayer.volume = Math.max(0, videoPlayer.volume - 0.1);
                break;
                
            case 'KeyM':
                e.preventDefault();
                videoPlayer.muted = !videoPlayer.muted;
                break;
                
            case 'KeyF':
                e.preventDefault();
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    videoPlayer.requestFullscreen?.();
                }
                break;
        }
    });
};

// ============== Player Click Handler (Mobil Focus Engelleme) ==============
const setupPlayerClickHandler = () => {
    const playerWrapper = document.querySelector('.wp-player-wrapper');
    const playerContainer = document.querySelector('.wp-player-container');
    
    const blurActiveInput = (e) => {
        // Eğer tıklanan element video veya overlay değilse çık
        const target = e.target;
        const isVideoArea = target.closest('.wp-player-wrapper') || target.closest('.wp-player-container');
        if (!isVideoArea) return;
        
        // Aktif element bir input ise blur yap
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            activeElement.blur();
        }
    };
    
    // Player container'a click listener
    if (playerContainer) {
        playerContainer.addEventListener('click', blurActiveInput);
        playerContainer.addEventListener('touchstart', blurActiveInput, { passive: true });
    }
    
    // Video element'e de ekle
    if (state.videoPlayer) {
        state.videoPlayer.addEventListener('click', blurActiveInput);
        state.videoPlayer.addEventListener('touchstart', blurActiveInput, { passive: true });
    }
};

// ============== Viewport Resize Handler (Mobil Klavye) ==============
const setupViewportResizeHandler = () => {
    // visualViewport API kontrolü
    if (!window.visualViewport) return;
    
    const playerWrapper = document.querySelector('.wp-player-wrapper');
    const mainContainer = document.querySelector('.watch-party-container');
    if (!playerWrapper || !mainContainer) return;
    
    // Sadece mobilde çalışsın
    const isMobile = () => window.innerWidth <= 1024;
    
    // Başlangıç viewport height'ını kaydet
    let initialHeight = window.visualViewport.height;
    
    // Debounced ve async layout güncellemesi
    let layoutTimeout;
    const updateLayout = () => {
        // Debounce - çok sık tetiklenmesin
        clearTimeout(layoutTimeout);
        layoutTimeout = setTimeout(() => {
            if (!isMobile()) {
                mainContainer.style.height = '';
                playerWrapper.style.maxHeight = '';
                return;
            }
            
            const currentHeight = window.visualViewport.height;
            const heightRatio = currentHeight / window.screen.height;
            const isKeyboardOpen = heightRatio < 0.75;

            if (isKeyboardOpen) {
                mainContainer.style.height = `${currentHeight}px`;
                document.body.classList.add('keyboard-open');
                
                const isVideoPlaying = document.body.classList.contains('video-playing');
                const maxHeightPercent = isVideoPlaying ? 40 : 50;
                const maxHeight = Math.max(120, currentHeight * (maxHeightPercent / 100));
                playerWrapper.style.maxHeight = `${maxHeight}px`;
            } else {
                mainContainer.style.height = '';
                playerWrapper.style.maxHeight = '';
                document.body.classList.remove('keyboard-open');
                initialHeight = currentHeight;
            }
            
            // Chat scroll - ayrı timeout ile
            setTimeout(() => {
                const chatMessages = document.getElementById('chat-messages');
                if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 0);
        }, 50); // 50ms debounce
    };
    
    // visualViewport resize event'i - klavye açılıp kapanınca tetiklenir
    window.visualViewport.addEventListener('resize', updateLayout);
    
    // Orientation değişikliğinde initial height'ı güncelle
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            initialHeight = window.visualViewport.height;
            mainContainer.style.height = '';
            playerWrapper.style.maxHeight = '';
        }, 300);
    });
};

export const setPlayerCallbacks = (cbs) => {
    Object.assign(callbacks, cbs);
};

// ============== Video Event Dinleyicileri ==============
export const setupVideoEventListeners = () => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    const shouldIgnoreEvent = () => {
        return state.isSyncing || 
               state.playerState === PlayerState.LOADING;
    };

    // Delayed pause timeout - play/seek geldiğinde iptal edilecek
    let delayedPauseTimeout;

    videoPlayer.addEventListener('play', () => {
        // Bekleyen pause timeout'u iptal et
        if (delayedPauseTimeout) {
            clearTimeout(delayedPauseTimeout);
            delayedPauseTimeout = null;
        }
        
        // Önce callback'i çağır - senkronizasyon için kritik
        if (!shouldIgnoreEvent() && state.playerState === PlayerState.READY) {
            state.playerState = PlayerState.PLAYING;
            callbacks.onPlay?.(videoPlayer.currentTime);
        }
        
        // DOM işlemleri async - blocking değil
        setTimeout(() => {
            document.body.classList.add('video-playing');
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 0);
    });

    videoPlayer.addEventListener('pause', () => {
        // Önce callback kontrolü - senkronizasyon için kritik
        if (!shouldIgnoreEvent() && 
            state.playerState !== PlayerState.LOADING &&
            state.playerState === PlayerState.PLAYING &&
            !videoPlayer.ended) {
            
            const timeSinceSeek = Date.now() - state.lastSeekTime;
            const timeSinceBufferEnd = Date.now() - state.lastBufferEndTime;
            
            // Seek'e çok yakınsa tamamen yutma, gecikmeyle gönder
            if (timeSinceSeek < 250) {
                if (delayedPauseTimeout) clearTimeout(delayedPauseTimeout);
                delayedPauseTimeout = setTimeout(() => {
                    delayedPauseTimeout = null;
                    if (videoPlayer.paused && !videoPlayer.ended && !state.isSyncing) {
                        state.playerState = PlayerState.READY;
                        callbacks.onPause?.(videoPlayer.currentTime);
                    }
                }, 280);
                // Aşağıya düşmesin - return
            } else if (timeSinceBufferEnd >= 100) {
                state.playerState = PlayerState.READY;
                callbacks.onPause?.(videoPlayer.currentTime);
            }
        }
        
        // DOM işlemleri async
        setTimeout(() => {
            document.body.classList.remove('video-playing');
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 0);
    });

    // Seek handling: seeking sadece flag tutsun, seeked'de gönder
    let seekTimeout;
    let isSeeking = false;
    
    videoPlayer.addEventListener('seeking', () => {
        // Bekleyen pause timeout'u iptal et (seek yapılıyor)
        if (delayedPauseTimeout) {
            clearTimeout(delayedPauseTimeout);
            delayedPauseTimeout = null;
        }
        
        if (shouldIgnoreEvent()) return;
        if (state.playerState === PlayerState.LOADING) return;
        if (state.playerState !== PlayerState.PLAYING && state.playerState !== PlayerState.READY) return;
        
        state.lastSeekTime = Date.now();
        isSeeking = true;
        
        // Fallback: seeked gelmezse 300ms sonra mevcut pozisyonu gönder
        clearTimeout(seekTimeout);
        seekTimeout = setTimeout(() => {
            if (!isSeeking) return;
            isSeeking = false;
            callbacks.onSeek?.(videoPlayer.currentTime);
        }, 300);
    });
    
    // Seeked: Seek tamamlandığında (tap veya drag bitti)
    videoPlayer.addEventListener('seeked', () => {
        if (shouldIgnoreEvent()) return;
        if (state.playerState === PlayerState.LOADING) return;
        
        // Timeout'u temizle ve hemen gönder
        clearTimeout(seekTimeout);
        
        if (isSeeking) {
            isSeeking = false;
            
            // Sadece PLAYING veya READY durumundaysa callback'i çağır
            if (state.playerState === PlayerState.PLAYING || state.playerState === PlayerState.READY) {
                callbacks.onSeek?.(videoPlayer.currentTime);
            }
        }
    });

    videoPlayer.addEventListener('waiting', () => {
        if (state.playerState !== PlayerState.PLAYING) return;
        callbacks.onBufferStart?.();
    });

    videoPlayer.addEventListener('playing', () => {
        if (state.playerState === PlayerState.WAITING_INTERACTION) return;
        if (state.isSyncing) return;
        if (state.playerState !== PlayerState.PLAYING && state.playerState !== PlayerState.READY) return;
        
        state.lastBufferEndTime = Date.now();
        callbacks.onBufferEnd?.();
    });

    videoPlayer.addEventListener('canplaythrough', () => {
        if (state.playerState === PlayerState.WAITING_INTERACTION) return;
        if (state.isSyncing) return;
        if (state.playerState === PlayerState.READY) {
            state.lastBufferEndTime = Date.now();
            callbacks.onBufferEnd?.();
        }
    }, { once: false });
};

// ============== Yardımcı Fonksiyonlar ==============
export const waitForSeek = async (timeout = 3000) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return true;

    // Zaten seeked durumundaysa hemen çık
    if (!videoPlayer.seeking) return true;

    return new Promise(resolve => {
        let resolved = false;

        const done = (success) => {
            if (resolved) return;
            resolved = true;
            videoPlayer.removeEventListener('seeked', onSeeked);
            resolve(success);
        };

        const onSeeked = () => done(true);
        videoPlayer.addEventListener('seeked', onSeeked, { once: true });
        setTimeout(() => {
            logger.video('Seek zaman aşımı - devam ediliyor');
            done(false);
        }, timeout);
    });
};

export const safePlay = async (timeout = 2000) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return { success: false, error: 'Video oynatıcı yok' };
    
    // Zaten oynatılıyorsa hemen çık
    if (!videoPlayer.paused) return { success: true };

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


// ============== HLS Yükleme ==============
const loadHls = (url, userAgent = '', referer = '', useProxy = false) => {
    return new Promise((resolve) => {
        const { videoPlayer } = state;
        
        if (state.hls) {
            state.hls.destroy();
            state.hls = null;
        }

        const isProxyEnabled = window.PROXY_ENABLED !== false;
        
        // Use shared HLS config factory
        const hlsConfig = createHlsConfig(userAgent, referer, state, useProxy || isProxyEnabled);

        state.hls = new Hls(hlsConfig);
        const loadUrl = useProxy ? buildProxyUrl(url, userAgent, referer, 'video') : url;
        
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
                             logger.video('Switching to forced proxy mode...');
                             resolved = true;
                             state.hls.destroy();
                             const result = await loadHls(url, userAgent, referer, true);
                             resolve(result);
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

// ============== Native Video Yükleme ==============
const loadNative = (url, userAgent = '', referer = '', useProxy = false) => {
    return new Promise((resolve) => {
        const { videoPlayer } = state;
        const loadUrl = useProxy ? buildProxyUrl(url, userAgent, referer, 'video') : url;
        videoPlayer.src = loadUrl;

        const onCanPlay = () => {
            cleanup();
            resolve(true);
        };

        const onError = async () => {
            cleanup();
            if (!useProxy && window.PROXY_ENABLED !== false) {
                const result = await loadNative(url, userAgent, referer, true);
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

// ============== Video Yükle ==============
export const loadVideo = async (url, format = 'hls', userAgent = '', referer = '', title = '', subtitleUrl = '') => {
    const { videoPlayer, playerOverlay, videoInfo, videoTitle: titleEl } = state;
    if (!videoPlayer || !playerOverlay) return false;

    state.playerState = PlayerState.LOADING;
    
    showLoadingOverlay('player-container');
    
    const exportBtn = document.getElementById('export-room-btn');
    if (exportBtn) exportBtn.style.display = 'none';
    
    // Cleanup
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }
    videoPlayer.querySelectorAll('track').forEach(t => t.remove());

    // Origin'i kaydet (Proxy URL ise içindeki asıl URL'i ayıkla) - use shared utility
    const { origin, baseUrl } = parseRemoteUrl(url);
    state.lastLoadedOrigin = origin;
    state.lastLoadedBaseUrl = baseUrl;

    // Content-Type Pre-check
    let detectedFormat = format;
    if (window.PROXY_ENABLED !== false) {
        try {
            const proxyUrl = buildProxyUrl(url, userAgent, referer, 'video');
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
        success = await loadHls(url, userAgent, referer, false);
    } else {
        success = await loadNative(url, userAgent, referer, false);
    }

    // Subtitle
    if (subtitleUrl) {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'Türkçe';
        track.srclang = 'tr';
        if (window.PROXY_ENABLED !== false) {
             track.src = buildProxyUrl(subtitleUrl, userAgent, referer, 'subtitle');
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
        
        // Overlay title güncelle ve flash yap
        const overlayTitle = document.getElementById('overlay-video-title');
        if (overlayTitle) {
            overlayTitle.textContent = title;
            flashOverlayElement(overlayTitle);
        }
    }

    state.lastLoadedUrl = url;
    state.playerState = success ? PlayerState.READY : PlayerState.IDLE;
    
    if (success) {
        hideLoadingOverlay('player-container');
        const exportBtn = document.getElementById('export-room-btn');
        if (exportBtn) exportBtn.style.display = '';
    } else {
        playerOverlay.classList.remove('hidden');
        playerOverlay.innerHTML = `
            <div class="wp-player-message">
                <i class="fa-solid fa-film"></i>
                <p>Video izlemek için yukarıdan bir URL girin</p>
            </div>
        `;
    }
    
    return success;
};

// ============== Etkileşim İstemi Göster ==============
export const showInteractionPrompt = () => {
    const { playerOverlay, videoPlayer } = state;
    if (!playerOverlay || !videoPlayer) return;
    if (state.playerState === PlayerState.WAITING_INTERACTION) return;

    state.playerState = PlayerState.WAITING_INTERACTION;
    
    playerOverlay.classList.remove('hidden');
    playerOverlay.innerHTML = `
        <div class="wp-player-message" style="cursor: pointer;">
            <i class="fa-solid fa-circle-play" style="font-size: 4rem; color: var(--wp-primary); margin-bottom: 1rem;"></i>
            <p>Yayına Katılmak İçin Tıklayın</p>
        </div>
    `;

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
        
        state.isSyncing = true;
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

// ============== Alıcılar ==============
export const getCurrentTime = () => state.videoPlayer?.currentTime || 0;
export const isSyncing = () => state.isSyncing;
export const isPlaying = () => state.playerState === PlayerState.PLAYING;
export const getLastLoadedUrl = () => state.lastLoadedUrl;

// ============== Ayarlayıcılar ==============
export const setWebSocketRef = (ws) => {
    state.ws = ws;
};

export const updateVideoInfo = (title, duration) => {
    if (state.videoTitle && title) state.videoTitle.textContent = title;
    if (state.videoDuration && duration) state.videoDuration.textContent = formatDuration(duration);
    if (state.videoInfo) state.videoInfo.style.display = 'block';
    
    // Overlay video title güncelle ve flash yap
    const overlayTitle = document.getElementById('overlay-video-title');
    if (overlayTitle && title) {
        overlayTitle.textContent = title;
        flashOverlayElement(overlayTitle);
    }
};
