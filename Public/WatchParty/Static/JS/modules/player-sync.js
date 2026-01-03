// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { PlayerState, state, waitForSeek, safePlay, showInteractionPrompt } from './player-core.min.js';
import { formatTime, logger } from './utils.min.js';
import { showToast, updateSyncInfoText } from './ui.min.js';

// ============== İlk Durumu Uygula ==============
export const applyState = async (serverState) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    // If waiting for interaction, just update time silently
    if (state.playerState === PlayerState.WAITING_INTERACTION) {
        videoPlayer.currentTime = clampTime(serverState.current_time);
        return;
    }

    state.isSyncing = true;
    
    const target = clampTime(serverState.current_time);
    const diff = Math.abs(videoPlayer.currentTime - target);
    
    // Playing iken daha toleranslı, paused iken daha hassas
    const threshold = serverState.is_playing ? 0.6 : 0.3;
    
    logger.sync(`State: ${target.toFixed(1)}s (diff: ${diff.toFixed(2)}s, thr: ${threshold}), playing=${serverState.is_playing}`);
    
    // Sadece anlamlı fark varsa seek yap (micro-seek spam'ı önle)
    if (diff > threshold) {
        videoPlayer.currentTime = target;
        await waitForSeek(3000); // HLS için daha uzun timeout
    }

    // Sonra play/pause - ÖNCELİKLİ
    if (serverState.is_playing) {
        const result = await safePlay();
        
        if (result.success) {
            state.playerState = PlayerState.PLAYING;
        } else if (result.error?.name === 'NotAllowedError') {
            state.isSyncing = false;
            showInteractionPrompt();
            return;
        } else {
            logger.error('Initial play failed:', result.error?.message || 'Unknown error');
            // Toast async - video başlatmayı engellemesin
            setTimeout(() => showToast('Video başlatılamadı', 'error'), 0);
            state.playerState = PlayerState.READY;
        }
    } else {
        videoPlayer.pause();
        state.playerState = PlayerState.READY;
    }
    
    state.isSyncing = false;
};

// ============== Ortak Play/Pause Helper ==============
const applyPlayPause = async (shouldPlay) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return { blocked: false };

    // Zaten doğru state'deyse erken çık
    if (shouldPlay && !videoPlayer.paused) {
        state.playerState = PlayerState.PLAYING;
        return { blocked: false };
    }
    if (!shouldPlay && videoPlayer.paused) {
        state.playerState = PlayerState.READY;
        return { blocked: false };
    }

    // LOADING/WAITING state'lerinde işlem yapma
    if (state.playerState === PlayerState.LOADING || state.playerState === PlayerState.WAITING_INTERACTION) {
        return { blocked: false };
    }

    if (shouldPlay) {
        const result = await safePlay();
        if (result.success) {
            state.playerState = PlayerState.PLAYING;
            return { blocked: false };
        }
        if (result.error?.name === 'NotAllowedError') {
            showInteractionPrompt();
            return { blocked: true };
        }
        if (result.error?.name === 'AbortError') {
            state.playerState = PlayerState.READY;
            return { blocked: false };
        }
        logger.error('Play failed:', result.error?.message || 'Unknown');
        showToast('Video başlatılamadı', 'error');
        state.playerState = PlayerState.READY;
        return { blocked: false };
    }

    videoPlayer.pause();
    state.playerState = PlayerState.READY;
    return { blocked: false };
};

// ============== Yardımcı: Zamanı güvenli aralığa clamp et ==============
const EPS = 0.25;

const clampTime = (t) => {
    const { videoPlayer, hls } = state;
    if (!videoPlayer) return t;

    // 1) Seekable varsa her zaman onu kullan (HLS için en güvenlisi)
    if (videoPlayer.seekable && videoPlayer.seekable.length > 0) {
        const start = videoPlayer.seekable.start(0);
        const end = videoPlayer.seekable.end(videoPlayer.seekable.length - 1);
        const safeEnd = Math.max(start, end - EPS);
        return Math.min(Math.max(t, start), safeEnd);
    }

    // 2) HLS'de duration'a güvenme (yanlış olabilir)
    if (hls) return Math.max(t, 0);

    // 3) Non-HLS: duration biliniyorsa clamp et
    if (Number.isFinite(videoPlayer.duration) && videoPlayer.duration > 0) {
        const safeEnd = Math.max(0, videoPlayer.duration - EPS);
        return Math.min(Math.max(t, 0), safeEnd);
    }

    return Math.max(t, 0);
};

// ============== Senkronizasyonu İşle (diğer kullanıcılardan) ==============
export const handleSync = async (msg) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    if (state.playerState === PlayerState.WAITING_INTERACTION) {
        videoPlayer.currentTime = clampTime(msg.current_time);
        
        // WAITING_INTERACTION'da da seek barrier ready gönder (yoksa timeout)
        void maybeSeekBarrierReady(msg, false);
        return;
    }

    // LOADING: seek_sync mesajını işle (diğerlerini skip)
    if (state.playerState === PlayerState.LOADING && !msg.seek_sync) return;

    state.isSyncing = true;
    
    const target = clampTime(msg.current_time);
    const timeDiff = Math.abs(videoPlayer.currentTime - target);
    const shouldSeek = msg.force_seek || timeDiff > 1.0;  // Soft sync: 1 saniye tolerans
    
    if (shouldSeek) {
        // clampTime ile güvenli seek
        if (Math.abs(videoPlayer.currentTime - target) > 0.05 || msg.force_seek) {
            videoPlayer.currentTime = target;
            await waitForSeek();
        }
    }

    // Sync play/pause state - ÖNCELİKLİ
    const r = await applyPlayPause(msg.is_playing);
    if (r.blocked) {
        state.isSyncing = false;
        return;
    }

    state.isSyncing = false;
    
    // UI güncellemesi - video başladıktan sonra async
    setTimeout(() => {
        updateSyncInfoText(msg.triggered_by, msg.is_playing ? 'oynatıyor' : 'durdurdu');
    }, 0);

    // SEEK BARRIER: Buffer dolduktan sonra "hazırım" gönder
    await maybeSeekBarrierReady(msg, true);
};

// ============== Seek-Sync: Buffer Bekle ==============
const waitForCanPlay = () => new Promise((resolve) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return resolve();
    
    // Zaten hazırsa hemen çık
    if (videoPlayer.readyState >= 3) return resolve();

    let poll, failsafe;
    const done = () => {
        clearInterval(poll);
        clearTimeout(failsafe);
        videoPlayer.removeEventListener('canplay', done);
        videoPlayer.removeEventListener('canplaythrough', done);
        videoPlayer.removeEventListener('loadeddata', done);
        resolve();
    };

    videoPlayer.addEventListener('canplay', done, { once: true });
    videoPlayer.addEventListener('canplaythrough', done, { once: true });
    videoPlayer.addEventListener('loadeddata', done, { once: true });

    poll = setInterval(() => {
        if (videoPlayer.readyState >= 3) done();
    }, 100);
    
    failsafe = setTimeout(done, 2000); // 4s -> 2s
});

// ============== Seek Barrier Ready ==============
const sendSeekReady = (epoch) => {
    if (state.lastSeekReadyEpoch === epoch) return;  // spam önleme
    state.lastSeekReadyEpoch = epoch;

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'seek_ready', seek_epoch: epoch }));
        logger.sync(`Seek ready sent, epoch: ${epoch}`);
    }
};

const maybeSeekBarrierReady = async (msg, wait = true) => {
    // Hardening: Seek epoch "truthy" check + robust logic
    const epoch = Number(msg.seek_epoch) || 0;
    
    if (msg.seek_sync && epoch > 0 && msg.is_playing === false) {
        if (wait) await waitForCanPlay();
        sendSeekReady(epoch);
    }
};

// ============== Seek İşle (diğer kullanıcılardan) ==============
export const handleSeek = async (msg) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;
    if (state.playerState === PlayerState.LOADING) return;
    if (state.playerState === PlayerState.WAITING_INTERACTION) {
        videoPlayer.currentTime = clampTime(msg.current_time);
        return;
    }

    // timeDiff'i clamped target ile hesapla (doğru karşılaştırma)
    const target = clampTime(msg.current_time);
    const timeDiff = Math.abs(videoPlayer.currentTime - target);

    if (timeDiff > 0.5) {
        state.isSyncing = true;
        videoPlayer.currentTime = target;
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
    
    // Clamped target zamanı göster (doğru UX, target üst satırlarda tanımlı)
    updateSyncInfoText(msg.triggered_by, `${formatTime(target)} konumuna atladı`);
};

// ============== Senkronizasyon Düzeltmesi (Server artık göndermiyor, no-op) ==============
export const handleSyncCorrection = async (msg) => {
    // Server 1A Simplification ile sync_correction göndermiyor.
    // Bu handler geriye uyumluluk için bırakıldı ama hiçbir şey yapmıyor.
    return;
};
