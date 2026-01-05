// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { ready } from './utils/dom.min.js';
import { GlobalSearch } from './components/search.min.js';

// Initialize when DOM is ready
ready(() => {
    const search = new GlobalSearch();
    search.init();
});
