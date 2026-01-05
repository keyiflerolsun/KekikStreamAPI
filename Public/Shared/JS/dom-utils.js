// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

export const flashOverlayElement = (element, duration = 3000) => {
    if (!element) return;
    
    element.classList.add('flash-visible');
    
    // Clear previous timeout
    if (element._hideTimeout) clearTimeout(element._hideTimeout);
    
    // Hide after duration
    element._hideTimeout = setTimeout(() => {
        element.classList.remove('flash-visible');
    }, duration);
};

export const setManagedTimeout = (element, key, callback, delay) => {
    if (!element) return;
    if (element[key]) clearTimeout(element[key]);
    element[key] = setTimeout(callback, delay);
};

export const clearManagedTimeout = (element, key) => {
    if (!element) return;
    if (element[key]) {
        clearTimeout(element[key]);
        element[key] = null;
    }
};

export const isNearBottom = (element, threshold = 100) => {
    if (!element) return false;
    return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
};

export const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};
