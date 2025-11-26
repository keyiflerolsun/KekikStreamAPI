// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

/**
 * Main Entry Point
 * Global initialization for all pages
 */

import { ready } from './utils/dom.min.js';
import { initUnquote } from './components/unquote.min.js';

// Initialize when DOM is ready
ready(() => {
    // Initialize URL unquote functionality
    initUnquote();
});