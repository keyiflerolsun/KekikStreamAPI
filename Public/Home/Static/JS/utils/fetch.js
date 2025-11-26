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
        this.controller = null;
    }
    
    /**
     * Execute fetch request
     * @param {string} url - URL to fetch
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>}
     */
    async fetch(url, options = {}) {
        // Abort previous request if exists
        this.abort();
        
        // Create new controller
        this.controller = new AbortController();
        
        try {
            return await fetch(url, {
                ...options,
                signal: this.controller.signal
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Fetch aborted');
            }
            throw error;
        }
    }
    
    /**
     * Abort current request
     */
    abort() {
        if (this.controller) {
            this.controller.abort();
            this.controller = null;
        }
    }
    
    /**
     * Check if request is active
     * @returns {boolean}
     */
    isActive() {
        return this.controller !== null;
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
