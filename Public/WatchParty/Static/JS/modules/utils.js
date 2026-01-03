// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

// Avatar listesi
const AVATARS = [
    '🎬','🎥','🎞️','📽️','🍿','🎭','🎪',
    '🌟','✨','🔥','💫','⚡','🌙','☄️','⭐',
    '🎮','🎯','🎨','🎹','🎧','🎤','🎻',
    '😎','🤩','😍','😈','🤓','🧐','🤠',
    '🦄','🐱','🐺','🦊','🐼','🐸','🐒',
    '🤖','👽','👻','💀','🎃','🐉','🦁'
];

// LocalStorage key
const STORAGE_KEY = 'watchparty_username';

// Random avatar seç
export const getRandomAvatar = () => {
    return AVATARS[Math.floor(Math.random() * AVATARS.length)];
};

// Kullanıcı adını localStorage'dan al
export const getSavedUsername = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
        return '';
    }
};

// Kullanıcı adını localStorage'a kaydet
export const saveUsername = (username) => {
    try {
        localStorage.setItem(STORAGE_KEY, username);
    } catch {
        // localStorage kullanılamıyorsa sessizce geç
    }
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
