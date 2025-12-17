// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

// Re-export everything from player-core
export {
    PlayerState,
    state,
    initPlayer,
    setPlayerCallbacks,
    setupVideoEventListeners,
    waitForSeek,
    safePlay,
    loadVideo,
    showInteractionPrompt,
    getCurrentTime,
    isPlaying,
    getLastLoadedUrl,
    updateVideoInfo
} from './player-core.min.js';

// Re-export everything from player-sync
export {
    applyState,
    handleSync,
    handleSeek,
    handleSyncCorrection
} from './player-sync.min.js';
