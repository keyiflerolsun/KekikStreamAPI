// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

/**
 * Main Entry Point
 * Global initialization for all pages
 */

import { ready } from './utils/dom.min.js';
import { initUnquote } from './components/unquote.min.js';

// Initialize when DOM is ready
ready(() => {
    console.log(
        "%ckeyiflerolsun",
        "background: #2B2A29; color: #EF7F1A; padding: 12px 25px; font-size: 18px; font-weight: 700; border-radius: 6px; text-shadow: 0 2px 4px rgba(0,0,0,0.4); display: block;",
    );
    console.log(
        "%ciletişim: https://t.me/keyiflerolsun",
        "background: #1c1c1c; color: #ccc; padding: 10px 15px; font-size: 14px; border-radius: 6px; margin-top: 4px; display: block;"
    );
    // Initialize URL unquote functionality
    initUnquote();
});