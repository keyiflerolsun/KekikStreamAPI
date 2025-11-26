// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

/**
 * Fetch and HTTP Utilities
 * Modern fetch wrappers with error handling
 */

/**
 * Fetch JSON data
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<any>}
 */
export async function fetchJSON(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Fetch error for ${url}:`, error);
        throw error;
    }
}

/**
 * Fetch with timeout
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw error;
    }
}

/**
 * Abortable Fetch Class
 * Allows creating abortable fetch requests
 */
export class AbortableFetch {
    constructor() {
        // Keep track of all active controllers so we can support concurrent requests
        this.controllers = new Set();
    }
    
    /**
     * Execute fetch request
     * @param {string} url - URL to fetch
     * @param {Object} options - Fetch options
     * @param {Object} config - Additional config, e.g. { abortPrevious: true }
     * @returns {Promise<Response>}
     */
    async fetch(url, options = {}, config = {}) {
        const { abortPrevious = true } = config;
        // Abort previous requests if requested
        if (abortPrevious) this.abort();
        
        // Create new controller for this request and track it
        const controller = new AbortController();
        this.controllers.add(controller);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            // Remove controller on successful completion
            this.controllers.delete(controller);
            return response;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Fetch aborted');
            }
            // Ensure we always remove the controller
            this.controllers.delete(controller);
            throw error;
        }
    }
    
    /**
     * Abort current request
     */
    abort() {
        if (this.controllers && this.controllers.size > 0) {
            this.controllers.forEach(ctrl => {
                try { ctrl.abort(); } catch (e) { /* ignore */ }
            });
            this.controllers.clear();
        }
    }
    
    /**
     * Check if request is active
     * @returns {boolean}
     */
    isActive() {
        return this.controllers && this.controllers.size > 0;
    }
}

/**
 * POST request helper
 * @param {string} url - URL to POST
 * @param {Object} data - Data to send
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>}
 */
export async function post(url, data, options = {}) {
    return fetchJSON(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        body: JSON.stringify(data),
        ...options
    });
}

/**
 * GET request helper
 * @param {string} url - URL to GET
 * @param {Object} params - URL parameters
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>}
 */
export async function get(url, params = {}, options = {}) {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    return fetchJSON(fullUrl, options);
}
