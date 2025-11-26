// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

// Global Search with Progressive Loading
(function() {
    'use strict';

    const searchInput = document.getElementById('global-search-input');
    const searchButton = document.getElementById('global-search-button');
    const searchStatus = document.getElementById('search-status');
    const searchResults = document.getElementById('search-results');
    const resultsGrid = document.getElementById('results-grid');
    const searchQueryDisplay = document.getElementById('search-query-display');
    const clearSearchButton = document.getElementById('clear-search');
    const pluginsList = document.getElementById('plugins-list');

    let currentSearch = null;
    let searchAbortController = null;

    // Enter tuşu ile arama
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performGlobalSearch();
        }
    });

    // Buton ile arama
    searchButton.addEventListener('click', performGlobalSearch);

    // Aramayı temizle
    clearSearchButton.addEventListener('click', clearSearch);

    function performGlobalSearch() {
        const query = searchInput.value.trim();
        
        if (!query || query.length < 2) {
            showStatus('En az 2 karakter girmelisiniz', 'error');
            return;
        }

        // Önceki aramayı iptal et
        if (searchAbortController) {
            searchAbortController.abort();
        }

        currentSearch = query;
        searchAbortController = new AbortController();

        // UI hazırlık
        searchQueryDisplay.textContent = `"${query}"`;
        searchResults.style.display = 'block';
        pluginsList.style.display = 'none';
        resultsGrid.innerHTML = '';

        // Scroll to results
        searchResults.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Her eklenti için paralel aramalar başlat
        const plugins = window.availablePlugins || [];
        let completedSearches = 0;
        let totalResults = 0;

        showStatus(`${plugins.length} eklentide aranıyor...`, 'searching');

        // Her eklenti için loading card ekle
        plugins.forEach(plugin => {
            addLoadingCard(plugin.name);
        });

        // Progressive search
        plugins.forEach(plugin => {
            searchInPlugin(plugin.name, query, searchAbortController.signal)
                .then(results => {
                    completedSearches++;
                    
                    if (results && results.length > 0) {
                        totalResults += results.length;
                        replaceLoadingWithResults(plugin.name, results);
                    } else {
                        removeLoadingCard(plugin.name);
                    }

                    updateSearchStatus(completedSearches, plugins.length, totalResults);
                })
                .catch(error => {
                    if (error.name !== 'AbortError') {
                        console.error(`Error searching in ${plugin.name}:`, error);
                    }
                    completedSearches++;
                    removeLoadingCard(plugin.name);
                    updateSearchStatus(completedSearches, plugins.length, totalResults);
                });
        });
    }

    async function searchInPlugin(pluginName, query, signal) {
        try {
            const response = await fetch(
                `/api/v1/search?plugin=${encodeURIComponent(pluginName)}&query=${encodeURIComponent(query)}`,
                { signal }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.result || [];
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            console.warn(`Failed to search in ${pluginName}:`, error.message);
            return [];
        }
    }

    function addLoadingCard(pluginName) {
        const loadingCard = document.createElement('div');
        loadingCard.className = 'loading-card';
        loadingCard.id = `loading-${pluginName}`;
        loadingCard.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <p>${pluginName}</p>
        `;
        resultsGrid.appendChild(loadingCard);
    }

    function removeLoadingCard(pluginName) {
        const loadingCard = document.getElementById(`loading-${pluginName}`);
        if (loadingCard) {
            loadingCard.style.opacity = '0';
            setTimeout(() => loadingCard.remove(), 300);
        }
    }

    function replaceLoadingWithResults(pluginName, results) {
        const loadingCard = document.getElementById(`loading-${pluginName}`);
        if (!loadingCard) return;

        // Her sonuç için kart oluştur
        results.forEach((result, index) => {
            const resultCard = createResultCard(pluginName, result);
            
            // Fade-in animasyonu için
            resultCard.style.opacity = '0';
            resultCard.style.transform = 'translateY(20px)';
            
            // Loading card'ın yerine ekle
            if (index === 0) {
                loadingCard.replaceWith(resultCard);
            } else {
                resultsGrid.appendChild(resultCard);
            }

            // Animasyon
            setTimeout(() => {
                resultCard.style.transition = 'all 0.4s ease-out';
                resultCard.style.opacity = '1';
                resultCard.style.transform = 'translateY(0)';
            }, index * 50);
        });
    }

    function createResultCard(pluginName, result) {
        const card = document.createElement('a');
        card.href = `/icerik/${encodeURIComponent(pluginName)}?url=${result.url}`;
        card.className = 'card';

        let cardContent = '';
        
        // Plugin badge (absolute positioned on card)
        cardContent += `<div class="plugin-badge">${pluginName}</div>`;
        
        cardContent += `<div class="card-content">`;

        // Poster varsa ekle
        if (result.poster) {
            cardContent += `<img src="${result.poster}" alt="${escapeHtml(result.title)}" class="card-image">`;
        }

        cardContent += `
            <h3 class="card-title">${escapeHtml(result.title)}</h3>
        </div>`;

        card.innerHTML = cardContent;
        return card;
    }

    function updateSearchStatus(completed, total, resultsCount) {
        if (completed === total) {
            if (resultsCount === 0) {
                showNoResults();
            } else {
                showStatus(`${resultsCount} sonuç bulundu`, 'success');
            }
        } else {
            showStatus(`${completed}/${total} eklenti tarandı - ${resultsCount} sonuç`, 'searching');
        }
    }

    function showNoResults() {
        resultsGrid.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1;">
                <i class="fas fa-search"></i>
                <h3>Sonuç Bulunamadı</h3>
                <p>Arama kriterlerinize uygun içerik bulunamadı. Farklı bir terim deneyin.</p>
            </div>
        `;
        showStatus('Sonuç bulunamadı', 'error');
    }

    function clearSearch() {
        searchInput.value = '';
        searchResults.style.display = 'none';
        pluginsList.style.display = 'block';
        resultsGrid.innerHTML = '';
        showStatus('');
        searchInput.focus();
        
        // Abort ongoing searches
        if (searchAbortController) {
            searchAbortController.abort();
        }
    }

    function showStatus(message, type = '') {
        searchStatus.textContent = message;
        searchStatus.className = 'search-status';
        
        if (type) {
            searchStatus.classList.add(type);
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Auto-focus on page load
    if (searchInput) {
        searchInput.focus();
    }
})();
