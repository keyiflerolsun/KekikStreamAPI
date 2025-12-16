// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

export const generateRandomUser = () => {
    const avatars = ['🎬', '🎥', '🎞️', '📽️', '🎭', '🎪', '🌟', '✨', '🔥', '💫', '🎮', '🎯', '🎨', '🎹'];
    const adjectives = ['Mutlu', 'Neşeli', 'Havalı', 'Süper', 'Efsane', 'Şirin', 'Tatlı', 'Kral', 'Pro'];
    const nouns = ['İzleyici', 'Misafir', 'Seyirci', 'Konuk', 'Fan', 'Dost', 'Arkadaş'];

    const avatar = avatars[Math.floor(Math.random() * avatars.length)];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 100);

    return {
        username: `${adjective}${noun}${number}`,
        avatar
    };
};

export const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

export const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hours > 0
        ? `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        : `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Styled Console Logger
const logStyles = {
    info  : 'color: #22d3ee; font-weight: bold;',
    success: 'color: #10b981; font-weight: bold;',
    warn  : 'color: #f59e0b; font-weight: bold;',
    error : 'color: #ef4444; font-weight: bold;',
    sync  : 'color: #a855f7; font-weight: bold;',
    video : 'color: #6366f1; font-weight: bold;'
};

export const logger = {
    info   : (msg, ...args) => console.log(`%c[ℹ️ INFO]%c ${msg}`, logStyles.info, '', ...args),
    success: (msg, ...args) => console.log(`%c[✅ OK]%c ${msg}`, logStyles.success, '', ...args),
    warn   : (msg, ...args) => console.log(`%c[⚠️ WARN]%c ${msg}`, logStyles.warn, '', ...args),
    error  : (msg, ...args) => console.log(`%c[❌ ERROR]%c ${msg}`, logStyles.error, '', ...args),
    sync   : (msg, ...args) => console.log(`%c[🔄 SYNC]%c ${msg}`, logStyles.sync, '', ...args),
    video  : (msg, ...args) => console.log(`%c[🎬 VIDEO]%c ${msg}`, logStyles.video, '', ...args)
};
