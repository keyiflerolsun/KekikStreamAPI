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
        videoPlayer.currentTime = serverState.current_time;
        return;
    }

    state.isSyncing = true;
    
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
        } else {
            logger.error('Initial play failed:', result.error?.message || 'Unknown error');
            showToast('Video başlatılamadı', 'error');
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

    if (shouldPlay) {
        if (videoPlayer.paused) {
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
        state.playerState = PlayerState.PLAYING;
        return { blocked: false };
    }

    if (!videoPlayer.paused) videoPlayer.pause();
    state.playerState = PlayerState.READY;
    return { blocked: false };
};

// ============== Yardımcı: Zaman seekable mı? (sadece HLS için) ==============
const isTimeSeekable = (time) => {
    const { videoPlayer, hls } = state;
    
    // HLS kullanılmıyorsa (MP4/native), tarayıcı kendi halleder - her zaman true
    if (!hls) {
        return true;
    }
    
    // HLS için seekable range kontrolü
    if (!videoPlayer || !videoPlayer.seekable || videoPlayer.seekable.length === 0) {
        return true; // Seekable bilgisi yoksa true varsay
    }
    
    for (let i = 0; i < videoPlayer.seekable.length; i++) {
        const start = videoPlayer.seekable.start(i);
        const end = videoPlayer.seekable.end(i);
        if (time >= start && time <= end) {
            return true;
        }
    }
    return false;
};

// HLS için: Seekable olmayan zamanı en yakın seekable noktaya clamp et
const clampToSeekable = (t) => {
    const { videoPlayer } = state;
    if (!videoPlayer?.seekable || videoPlayer.seekable.length === 0) return t;

    const start = videoPlayer.seekable.start(0);
    const end = videoPlayer.seekable.end(videoPlayer.seekable.length - 1);
    return Math.max(start, Math.min(t, end));
};

// ============== Senkronizasyonu İşle (diğer kullanıcılardan) ==============
export const handleSync = async (msg) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    if (state.playerState === PlayerState.WAITING_INTERACTION) {
        videoPlayer.currentTime = msg.current_time;
        
        // WAITING_INTERACTION'da da seek barrier ready gönder (yoksa timeout)
        void maybeSeekBarrierReady(msg, false);
        return;
    }

    // LOADING: seek_sync mesajını işle (diğerlerini skip)
    if (state.playerState === PlayerState.LOADING && !msg.seek_sync) return;

    state.isSyncing = true;
    
    const timeDiff = Math.abs(videoPlayer.currentTime - msg.current_time);
    const shouldSeek = msg.force_seek || timeDiff > 1.0;  // Soft sync: 1 saniye tolerans
    
    if (shouldSeek) {
        let target = msg.current_time;
        
        // Seekable kontrolü: Hedef zaman seekable değilse en yakın noktaya clamp et
        if (!isTimeSeekable(target)) {
            target = clampToSeekable(target);
            logger.sync(`Target ${msg.current_time.toFixed(1)}s not seekable, clamped to ${target.toFixed(1)}s`);
        }
        
        // Clamp sonrası hâlâ fark varsa seek yap
        if (Math.abs(videoPlayer.currentTime - target) > 0.05 || msg.force_seek) {
            videoPlayer.currentTime = target;
            await waitForSeek();
        }
    }

    // Sync play/pause state
    const r = await applyPlayPause(msg.is_playing);
    if (r.blocked) {
        state.isSyncing = false;
        return;
    }

    state.isSyncing = false;
    updateSyncInfoText(msg.triggered_by, msg.is_playing ? 'oynatıyor' : 'durdurdu');

    // SEEK BARRIER: Buffer dolduktan sonra "hazırım" gönder
    await maybeSeekBarrierReady(msg, true);
};

// ============== Seek-Sync: Buffer Bekle ==============
const waitForCanPlay = () => new Promise((resolve) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return resolve();

    let poll, failsafe;
    const done = () => {
        cleanup();
        resolve();
    };

    const check = () => {
        // 3: HAVE_FUTURE_DATA, 4: HAVE_ENOUGH_DATA
        // Hardening: Live HLS için readyState >= 2 (HAVE_CURRENT_DATA) yeterli olabilir
        // + seeking değil + buffered var
        if (videoPlayer.readyState >= 3) {
            done();
        } else if (videoPlayer.readyState >= 2 && !videoPlayer.seeking && videoPlayer.buffered.length > 0) {
            // "Son %1" case için erken çıkış
            done();
        }
    };

    const onCanPlay = () => check();

    const cleanup = () => {
        videoPlayer.removeEventListener('canplay', onCanPlay);
        videoPlayer.removeEventListener('canplaythrough', onCanPlay);
        videoPlayer.removeEventListener('loadeddata', onCanPlay);
        clearInterval(poll);
        clearTimeout(failsafe);
    };

    videoPlayer.addEventListener('canplay', onCanPlay);
    videoPlayer.addEventListener('canplaythrough', onCanPlay);
    videoPlayer.addEventListener('loadeddata', onCanPlay);

    poll = setInterval(check, 150);
    failsafe = setTimeout(done, 4000); // aşırı beklemeyi önle

    check();
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
        videoPlayer.currentTime = msg.current_time;
        return;
    }

    const timeDiff = Math.abs(videoPlayer.currentTime - msg.current_time);

    if (timeDiff > 0.5) {
        state.isSyncing = true;
        videoPlayer.currentTime = msg.current_time;
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

// ============== Senkronizasyon Düzeltmesi İşle (sunucu heartbeat) ==============
export const handleSyncCorrection = async (msg) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    // Skip if not playing
    if (state.playerState !== PlayerState.PLAYING) return;

    state.isSyncing = true;
    
    try {
        if (msg.action === 'rate') {
            const rate = msg.rate || 1.0;
            if (Math.abs(videoPlayer.playbackRate - rate) > 0.02) {
                logger.sync(`Rate: ${rate}x (drift: ${msg.drift.toFixed(2)}s)`);
                videoPlayer.playbackRate = rate;
            }
        } else if (msg.action === 'live_edge') {
            if (!videoPlayer?.seekable || videoPlayer.seekable.length === 0) return;

            const end = videoPlayer.seekable.end(videoPlayer.seekable.length - 1);
            const start = videoPlayer.seekable.start(0);
            const offset = msg.offset ?? 2.0;

            const target = Math.max(start, end - offset);
            logger.sync(`Live edge sync: target=${target.toFixed(1)}s (drift: ${msg.drift.toFixed(2)}s)`);

            const wasPlaying = state.playerState === PlayerState.PLAYING;

            videoPlayer.pause();
            state.playerState = PlayerState.READY;

            videoPlayer.currentTime = target;
            await waitForSeek();

            if (wasPlaying) {
                const r = await safePlay();
                if (r.success) {
                    state.playerState = PlayerState.PLAYING;
                    videoPlayer.playbackRate = 1.0;
                }
            }
        } else if (msg.action === 'buffer') {
            let target = msg.target_time;
            
            // Seekable kontrolü: Hedef zaman seekable değilse clamp et (skip yerine)
            if (!isTimeSeekable(target)) {
                target = clampToSeekable(target);
                logger.sync(`Buffer sync: ${msg.target_time.toFixed(1)}s not seekable, clamped to ${target.toFixed(1)}s`);
            } else {
                logger.sync(`Buffer sync: ${target.toFixed(1)}s`);
            }

            const wasPlaying = state.playerState === PlayerState.PLAYING;

            videoPlayer.pause();
            state.playerState = PlayerState.READY;  // Pause sırasında READY

            showToast('Senkronize ediliyor...', 'warning');
            videoPlayer.currentTime = target;

            await waitForSeek();

            // Sadece önceden oynatılıyorsa play et
            if (wasPlaying) {
                const result = await safePlay();

                if (result.success) {
                    state.playerState = PlayerState.PLAYING;
                    videoPlayer.playbackRate = 1.0;
                } else {
                    if (result.error?.name === 'NotAllowedError') {
                        state.isSyncing = false;
                        showInteractionPrompt();
                        return;
                    }
                    state.playerState = PlayerState.READY;
                    logger.sync('Buffer sync play failed, video paused');
                }
            }
        }
    } catch (e) {
        logger.sync(`Sync correction error: ${e.message}`);
        state.playerState = PlayerState.READY;
        showToast('Senkronizasyon hatası', 'error');
    } finally {
        state.isSyncing = false;
    }
};
