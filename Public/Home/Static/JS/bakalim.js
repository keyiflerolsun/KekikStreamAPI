// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

document.addEventListener("DOMContentLoaded", function() {
    const unquotes = document.querySelectorAll('.unquote');

    unquotes.forEach(function(elem) {
        let _elem = elem.textContent;
        _elem = decodeURIComponent(_elem).replace(/\+/g, " ");

        elem.textContent = _elem;
    });
});