// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

/**
 * URL Unquote Component
 * Decodes URL-encoded text elements
 */

import { $$ } from '../utils/dom.min.js';

/**
 * Initialize unquote functionality
 * Finds all elements with .unquote class and decodes their content
 */
export function initUnquote() {
    const unquotes = $$('.unquote');
    
    unquotes.forEach(elem => {
        let text = elem.textContent;
        text = decodeURIComponent(text).replace(/\+/g, " ");
        elem.textContent = text;
    });
}

/**
 * Decode single element
 * @param {Element} element - Element to decode
 */
export function decodeElement(element) {
    if (!element) return;
    let text = element.textContent;
    text = decodeURIComponent(text).replace(/\+/g, " ");
    element.textContent = text;
}

/**
 * Decode text string
 * @param {string} text - Text to decode
 * @returns {string}
 */
export function decodeText(text) {
    return decodeURIComponent(text).replace(/\+/g, " ");
}
