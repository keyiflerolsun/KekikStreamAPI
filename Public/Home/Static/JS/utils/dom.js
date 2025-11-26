// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

/**
 * DOM Manipulation Utilities
 * Modern DOM helper functions for cleaner code
 */

/**
 * Query selector shorthand - returns first matching element
 * @param {string} selector - CSS selector
 * @param {Element} context - Optional context element
 * @returns {Element|null}
 */
export const $ = (selector, context = document) => context.querySelector(selector);

/**
 * Query selector all shorthand - returns all matching elements
 * @param {string} selector - CSS selector
 * @param {Element} context - Optional context element
 * @returns {NodeList}
 */
export const $$ = (selector, context = document) => context.querySelectorAll(selector);

/**
 * Create element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Element attributes
 * @param {Array|string} children - Child elements or text
 * @returns {Element}
 */
export function createElement(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    
    // Set attributes
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = dataValue;
            });
        } else if (key.startsWith('on')) {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
            element.setAttribute(key, value);
        }
    });
    
    // Append children
    if (typeof children === 'string') {
        element.textContent = children;
    } else if (Array.isArray(children)) {
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else {
                element.appendChild(child);
            }
        });
    }
    
    return element;
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string}
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show element(s)
 * @param {Element|NodeList|string} element - Element(s) or selector
 */
export function show(element) {
    const elements = typeof element === 'string' ? $$(element) : 
                     element instanceof NodeList ? element : [element];
    elements.forEach(el => el && (el.style.display = ''));
}

/**
 * Hide element(s)
 * @param {Element|NodeList|string} element - Element(s) or selector
 */
export function hide(element) {
    const elements = typeof element === 'string' ? $$(element) : 
                     element instanceof NodeList ? element : [element];
    elements.forEach(el => el && (el.style.display = 'none'));
}

/**
 * Toggle element visibility
 * @param {Element|string} element - Element or selector
 */
export function toggle(element) {
    const el = typeof element === 'string' ? $(element) : element;
    if (el) {
        el.style.display = el.style.display === 'none' ? '' : 'none';
    }
}

/**
 * Add class(es) to element
 * @param {Element|string} element - Element or selector
 * @param {...string} classes - Class name(s)
 */
export function addClass(element, ...classes) {
    const el = typeof element === 'string' ? $(element) : element;
    if (el) el.classList.add(...classes);
}

/**
 * Remove class(es) from element
 * @param {Element|string} element - Element or selector
 * @param {...string} classes - Class name(s)
 */
export function removeClass(element, ...classes) {
    const el = typeof element === 'string' ? $(element) : element;
    if (el) el.classList.remove(...classes);
}

/**
 * Toggle class on element
 * @param {Element|string} element - Element or selector
 * @param {string} className - Class name
 */
export function toggleClass(element, className) {
    const el = typeof element === 'string' ? $(element) : element;
    if (el) el.classList.toggle(className);
}

/**
 * Smooth scroll to element
 * @param {Element|string} element - Element or selector
 * @param {Object} options - Scroll options
 */
export function scrollTo(element, options = { behavior: 'smooth', block: 'start' }) {
    const el = typeof element === 'string' ? $(element) : element;
    if (el) el.scrollIntoView(options);
}

/**
 * Wait for DOM to be ready
 * @param {Function} callback - Callback function
 */
export function ready(callback) {
    if (document.readyState !== 'loading') {
        callback();
    } else {
        document.addEventListener('DOMContentLoaded', callback);
    }
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function}
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in ms
 * @returns {Function}
 */
export function throttle(func, delay) {
    let lastCall = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastCall < delay) return;
        lastCall = now;
        return func(...args);
    };
}
