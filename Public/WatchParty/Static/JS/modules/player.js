// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

// player-core'dan her şeyi yeniden dışa aktar
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

// player-sync'ten her şeyi yeniden dışa aktar
export {
    applyState,
    handleSync,
    handleSeek,
    handleSyncCorrection
} from './player-sync.min.js';
