// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

export { escapeHtml } from '/static/shared/JS/dom-utils.min.js';

export const $ = (selector, context = document) => context.querySelector(selector);

export const $$ = (selector, context = document) => context.querySelectorAll(selector);

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

export function show(element) {
    const elements = typeof element === 'string' ? $$(element) : 
                     element instanceof NodeList ? element : [element];
    elements.forEach(el => el && (el.style.display = ''));
}

export function hide(element) {
    const elements = typeof element === 'string' ? $$(element) : 
                     element instanceof NodeList ? element : [element];
    elements.forEach(el => el && (el.style.display = 'none'));
}

export function toggle(element) {
    const el = typeof element === 'string' ? $(element) : element;
    if (el) {
        el.style.display = el.style.display === 'none' ? '' : 'none';
    }
}

export function addClass(element, ...classes) {
    const el = typeof element === 'string' ? $(element) : element;
    if (el) el.classList.add(...classes);
}

export function removeClass(element, ...classes) {
    const el = typeof element === 'string' ? $(element) : element;
    if (el) el.classList.remove(...classes);
}

export function toggleClass(element, className) {
    const el = typeof element === 'string' ? $(element) : element;
    if (el) el.classList.toggle(className);
}

export function scrollTo(element, options = { behavior: 'smooth', block: 'start' }) {
    const el = typeof element === 'string' ? $(element) : element;
    if (el) el.scrollIntoView(options);
}

export function ready(callback) {
    if (document.readyState !== 'loading') {
        callback();
    } else {
        document.addEventListener('DOMContentLoaded', callback);
    }
}

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

export function throttle(func, delay) {
    let lastCall = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastCall < delay) return;
        lastCall = now;
        return func(...args);
    };
}
