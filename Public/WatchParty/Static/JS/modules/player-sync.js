// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { PlayerState, state, waitForSeek, safePlay, showInteractionPrompt } from './player-core.min.js';
import { formatTime, logger } from './utils.min.js';
import { showToast, updateSyncInfoText } from './ui.min.js';

// ============== Apply Initial State ==============
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

// ============== Handle Sync (from other users) ==============
export const handleSync = async (msg) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    if (state.playerState === PlayerState.WAITING_INTERACTION) {
        videoPlayer.currentTime = msg.current_time;
        return;
    }

    if (state.playerState === PlayerState.LOADING) return;

    state.isSyncing = true;
    
    const timeDiff = Math.abs(videoPlayer.currentTime - msg.current_time);
    const shouldSeek = msg.force_seek || timeDiff > 0.5;
    
    if (shouldSeek) {
        logger.sync(`${msg.force_seek ? 'Force sync' : 'Adjustment'}: ${timeDiff.toFixed(2)}s`);
        videoPlayer.currentTime = msg.current_time;
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
            } else {
                if (result.error?.name === 'AbortError') {
                    state.playerState = PlayerState.READY;
                    return;
                }
                
                logger.error('Play failed:', result.error?.message || 'Unknown error');
                showToast('Video başlatılamadı', 'error');
                state.playerState = PlayerState.READY;
            }
        } else {
            state.playerState = PlayerState.PLAYING;
        }
    } else {
        if (!videoPlayer.paused) {
            videoPlayer.pause();
        }
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

// ============== Handle Sync Correction (from server heartbeat) ==============
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
        } else if (msg.action === 'buffer') {
            logger.sync(`Buffer sync: ${msg.target_time.toFixed(1)}s`);

            const wasPlaying = state.playerState === PlayerState.PLAYING;

            videoPlayer.pause();

            if (wasPlaying) {
                state.playerState = PlayerState.PLAYING;
            }

            showToast('Senkronize ediliyor...', 'warning');
            videoPlayer.currentTime = msg.target_time;
            
            await waitForSeek();
            
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
    } catch (e) {
        logger.sync(`Sync correction error: ${e.message}`);
        state.playerState = PlayerState.READY;
        showToast('Senkronizasyon hatası', 'error');
    } finally {
        state.isSyncing = false;
    }
};
