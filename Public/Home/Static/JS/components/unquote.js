// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { $$ } from '../utils/dom.min.js';

export function initUnquote() {
    const unquotes = $$('.unquote');
    
    unquotes.forEach(elem => {
        let text = elem.textContent;
        text = decodeURIComponent(text).replace(/\+/g, " ");
        elem.textContent = text;
    });
}

export function decodeElement(element) {
    if (!element) return;
    let text = element.textContent;
    text = decodeURIComponent(text).replace(/\+/g, " ");
    element.textContent = text;
}

export function decodeText(text) {
    return decodeURIComponent(text).replace(/\+/g, " ");
}
