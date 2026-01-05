// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { escapeHtml } from './utils.min.js';
import { flashOverlayElement } from '/static/shared/JS/dom-utils.min.js';

// ============== State ==============
const state = {
    toastContainer: null,
    connectionModal: null,
    usernameModal: null
};

export const initUI = () => {
    state.toastContainer = document.getElementById('toast-container');
    state.connectionModal = document.getElementById('connection-modal');
    state.usernameModal = document.getElementById('username-modal');
    // Ping display (sağ üst)
    state.pingDisplay = document.getElementById('ping-display');
    if (!state.pingDisplay) {
        const headerRight = document.querySelector('.wp-header-right');
        if (headerRight) {
            const el = document.createElement('div');
            el.id = 'ping-display';
            el.className = 'wp-online-count wp-ping-display';
            el.innerHTML = `<i class="fa-solid fa-wave-square"></i><span>-- ms</span>`;
            headerRight.appendChild(el);
            state.pingDisplay = el;
        }
    }
};

export const showToast = (message, type = 'info') => {
    if (!state.toastContainer) return;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `wp-toast ${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${icons[type] || icons.info}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    state.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
};

export const showConnectionModal = () => {
    if (state.connectionModal) state.connectionModal.style.display = 'flex';
};

export const hideConnectionModal = () => {
    if (state.connectionModal) state.connectionModal.style.display = 'none';
};

export const updateSyncStatus = (status) => {
    const syncStatus = document.getElementById('sync-status');
    if (!syncStatus) return;

    syncStatus.classList.remove('connected', 'disconnected');

    const statusMap = {
        connected: {
            class: 'connected',
            html: '<i class="fa-solid fa-link"></i><span>Bağlı</span>'
        },
        disconnected: {
            class: 'disconnected',
            html: '<i class="fa-solid fa-link-slash"></i><span>Bağlantı Yok</span>'
        },
        connecting: {
            class: '',
            html: '<i class="fa-solid fa-spinner fa-spin"></i><span>Bağlanıyor...</span>'
        }
    };

    const config = statusMap[status] || statusMap.connecting;
    if (config.class) syncStatus.classList.add(config.class);
    syncStatus.innerHTML = config.html;
};

export const updatePing = (ms) => {
    if (!state.pingDisplay) return;
    const span = state.pingDisplay.querySelector('span');

    // Null/undefined means no measured value
    if (ms == null) {
        if (span) span.textContent = `-- ms`;
        state.pingDisplay.classList.remove('good', 'warn', 'bad');
        return;
    }

    const rounded = Math.max(0, Math.round(ms));
    if (span) span.textContent = `${rounded} ms`;

    state.pingDisplay.classList.remove('good', 'warn', 'bad');
    if (rounded < 100) {
        state.pingDisplay.classList.add('good');
    } else if (rounded < 200) {
        state.pingDisplay.classList.add('warn');
    } else {
        state.pingDisplay.classList.add('bad');
    }
};

export const updateSyncInfoText = (username, action) => {
    const syncInfoText = document.getElementById('sync-info-text');
    const overlaySyncText = document.getElementById('overlay-sync-text');
    const overlaySync = document.querySelector('.wp-overlay-sync');
    const text = `${username} ${action}`;
    
    if (syncInfoText) {
        syncInfoText.textContent = text;
        setTimeout(() => { syncInfoText.textContent = 'Senkronize'; }, 3000);
    }
    
    // Overlay sync text güncelle ve geçici olarak göster
    if (overlaySyncText) {
        overlaySyncText.textContent = text;
        flashOverlayElement(overlaySync);
        setTimeout(() => { overlaySyncText.textContent = 'Senkronize'; }, 3000);
    }
    
    // Host Kontrolü Bildirimi - Video üzerinde floating notification
    showHostControlNotification(username, action);
};

// ============== Host Control Notification ==============
// Kim play/pause/seek yaptığını görsel olarak bildirir
let hostNotificationTimeout = null;

const showHostControlNotification = (username, action) => {
    // Sistem mesajlarını gösterme (Heartbeat Sync gibi)
    if (username === 'System' || username === 'Sistem') return;
    
    let notification = document.getElementById('host-control-notification');
    
    // Yoksa oluştur
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'host-control-notification';
        notification.className = 'wp-host-notification';
        
        // player-wrapper'a ekle (position: relative olan element)
        const playerWrapper = document.querySelector('.wp-player-wrapper');
        if (playerWrapper) {
            playerWrapper.appendChild(notification);
        } else {
            return;
        }
    }
    
    // Action'a göre ikon belirle
    let icon = 'fa-play';
    if (action.includes('durdurdu') || action.includes('pause')) {
        icon = 'fa-pause';
    } else if (action.includes('konumuna') || action.includes('atladı') || action.includes('seek')) {
        icon = 'fa-forward';
    } else if (action.includes('oynatıyor') || action.includes('play')) {
        icon = 'fa-play';
    }
    
    notification.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span><strong>${username}</strong> ${action}</span>
    `;
    
    // Göster
    notification.classList.remove('hidden');
    notification.classList.add('visible');
    
    // Önceki timeout'u temizle
    if (hostNotificationTimeout) {
        clearTimeout(hostNotificationTimeout);
    }
    
    // 3 saniye sonra gizle
    hostNotificationTimeout = setTimeout(() => {
        notification.classList.remove('visible');
        notification.classList.add('hidden');
    }, 3000);
};

// ============== Sync Rate Indicator ==============
// PlaybackRate değişikliklerini görsel olarak gösterir
let syncRateTimeout = null;

export const updateSyncRateIndicator = (rate) => {
    // Hem Chat bölümündeki hem de Video üzerindeki overlay indikatörlerini seç
    const syncInfoEl = document.querySelector('.wp-sync-info');
    const syncInfoText = document.getElementById('sync-info-text');
    const overlaySyncEl = document.querySelector('.wp-overlay-sync');
    const overlaySyncText = document.getElementById('overlay-sync-text');
    
    const elements = [syncInfoEl, overlaySyncEl].filter(el => el != null);
    const texts = [syncInfoText, overlaySyncText].filter(el => el != null);
    
    if (elements.length === 0) return;
    
    // Önceki timeout'u temizle
    if (syncRateTimeout) {
        clearTimeout(syncRateTimeout);
        syncRateTimeout = null;
    }
    
    let statusText = 'Senkronize';
    let iconClass = 'fa-solid fa-rotate';
    let currentClass = 'synced';
    
    // Rate'e göre durum belirle
    if (rate > 1.0) {
        statusText = `Yakalıyor (${rate.toFixed(2)}x)`;
        iconClass = 'fa-solid fa-forward';
        currentClass = 'catching-up';
    } else if (rate < 1.0) {
        statusText = `Bekliyor (${rate.toFixed(2)}x)`;
        iconClass = 'fa-solid fa-backward';
        currentClass = 'slowing';
    }
    
    // Tüm elementleri güncelle
    elements.forEach(el => {
        el.classList.remove('synced', 'catching-up', 'slowing');
        el.classList.add(currentClass);
        
        const icon = el.querySelector('i');
        if (icon) icon.className = iconClass;
        
        // Eğer overlay'deysek ve rate 1.0 değilse, kullanıcıya göstermek için "flash" yap
        if (el === overlaySyncEl && rate !== 1.0) {
            flashOverlayElement(el);
        }
    });
    
    texts.forEach(t => {
        t.textContent = statusText;
    });
    
    // Rate 1.0 ise (senkronize olduysa), 3 saniye sonra (veya rate değişince) indikatörü temizlemiyoruz 
    // çünkü 'synced' sınıfı zaten default state. Sadece metni 'Senkronize' tutuyoruz.
};


// Tüm overlay elementlerini geçici olarak göster (ilk giriş için)
export const flashAllOverlayElements = () => {
    const overlayTitle = document.getElementById('overlay-video-title');
    const overlayViewers = document.querySelector('.wp-overlay-viewers');
    const overlaySync = document.querySelector('.wp-overlay-sync');
    
    // Her birini ayrı ayrı flash yap (kendi timeout'larıyla)
    if (overlayTitle) flashOverlayElement(overlayTitle);
    if (overlayViewers) flashOverlayElement(overlayViewers);
    if (overlaySync) flashOverlayElement(overlaySync);
};

export const copyRoomLink = async () => {
    try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Link kopyalandı!', 'success');
    } catch {
        showToast('Link kopyalanamadı', 'error');
    }
};

export const toggleElement = (elementId) => {
    const el = document.getElementById(elementId);
    if (!el) return false;

    const isHidden = el.style.display === 'none' || getComputedStyle(el).display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    return isHidden;
};

export const showSkeleton = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.classList.add('skeleton-loading');
};

export const hideSkeleton = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.classList.remove('skeleton-loading');
};

export const showLoadingOverlay = (containerId = null) => {
    const overlay = document.getElementById('player-overlay');
    if (!overlay) return;
    
    // Optionally show skeleton on container
    if (containerId) {
        showSkeleton(containerId);
    }
    
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
        <div class="wp-player-message">
            <i class="fa-solid fa-spinner" style="font-size: 3rem; color: var(--wp-primary); margin-bottom: 1rem; display: inline-block; transform-origin: center; animation: spin 1s linear infinite;"></i>
            <p>Video yükleniyor...</p>
        </div>
    `;
};

export const hideLoadingOverlay = (containerId = null) => {
    const overlay = document.getElementById('player-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    
    // Optionally hide skeleton on container
    if (containerId) {
        hideSkeleton(containerId);
    }
};

// ============== Username Modal ==============
export const showUsernameModal = (avatar, savedUsername = '') => {
    return new Promise((resolve) => {
        const modal = state.usernameModal || document.getElementById('username-modal');
        const avatarEl = document.getElementById('modal-avatar');
        const input = document.getElementById('username-input');
        const form = document.getElementById('username-form');
        
        if (!modal || !input || !form) {
            // Fallback: modal yoksa random kullanıcı döndür
            resolve(savedUsername || `Misafir${Math.floor(Math.random() * 1000)}`);
            return;
        }

        // Avatar'ı ayarla
        if (avatarEl) {
            avatarEl.textContent = avatar;
        }

        // Kaydedilmiş kullanıcı adını doldur
        if (savedUsername) {
            input.value = savedUsername;
        }

        // Modal'ı göster
        modal.style.display = 'flex';
        
        // Input'a focus
        setTimeout(() => input.focus(), 100);

        // Form submit handler
        const handleSubmit = (e) => {
            e.preventDefault();
            const username = input.value.trim();
            
            if (!username) {
                input.classList.add('shake');
                setTimeout(() => input.classList.remove('shake'), 500);
                return;
            }

            // Modal'ı gizle
            modal.style.display = 'none';
            
            // Event listener'ı temizle
            form.removeEventListener('submit', handleSubmit);
            
            resolve(username);
        };

        form.addEventListener('submit', handleSubmit);
        
        // Enter tuşu ile de submit
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        });
    });
};
