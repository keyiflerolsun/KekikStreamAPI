// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

/**
 * Main Entry Point
 * Global initialization for all pages
 */

import { ready } from './utils/dom.min.js';
import { initUnquote } from './components/unquote.min.js';
import { showBranding } from '/static/shared/JS/branding.min.js';

// Initialize when DOM is ready
ready(() => {
    // Show branding in console
    showBranding();
    
    // Initialize URL unquote functionality
    initUnquote();
});