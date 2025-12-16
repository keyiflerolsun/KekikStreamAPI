// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { escapeHtml } from './utils.js';

// ============== State ==============
const state = {
    toastContainer: null,
    connectionModal: null
};

export const initUI = () => {
    state.toastContainer = document.getElementById('toast-container');
    state.connectionModal = document.getElementById('connection-modal');
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
    if (syncInfoText) {
        syncInfoText.textContent = `${username} ${action}`;
        setTimeout(() => { syncInfoText.textContent = 'Senkronize'; }, 3000);
    }
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
