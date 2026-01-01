// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

/**
 * Global Search Component
 * Implements progressive search across all plugins
 */

import { $, $$, escapeHtml, scrollTo, addClass, removeClass } from '../utils/dom.min.js';
import { AbortableFetch } from '../utils/fetch.min.js';

export class GlobalSearch {
    constructor() {
        this.searchInput = $('#global-search-input');
        this.searchButton = $('#global-search-button');
        this.searchStatus = $('#search-status');
        this.searchResults = $('#search-results');
        this.resultsGrid = $('#results-grid');
        this.searchQueryDisplay = $('#search-query-display');
        this.clearSearchButton = $('#clear-search');
        this.pluginsList = $('#plugins-list');
        this.pluginFilters = $('#plugin-filters');
        this.filtersContainer = $('#filters-container');
        this.clearFiltersButton = $('#clear-filters');
        
        this.currentSearch = null;
        this.fetchHelper = new AbortableFetch();
        this.plugins = window.availablePlugins || [];
        
        // Filter state
        this.searchResultsByPlugin = new Map(); // { pluginName: [results] }
        this.activeFilters = new Set();
    }
    
    /**
     * Initialize search component
     */
    init() {
        if (!this.searchInput) return;
        
        // Event listeners
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });
        
        this.searchButton.addEventListener('click', () => this.performSearch());
        this.clearSearchButton.addEventListener('click', () => this.clearSearch());
        
        if (this.clearFiltersButton) {
            this.clearFiltersButton.addEventListener('click', () => this.clearFilters());
        }
        
        // Auto-focus
        this.searchInput.focus();
    }
    
    /**
     * Perform global search
     */
    async performSearch() {
        const query = this.searchInput.value.trim();
        
        if (!query || query.length < 2) {
            this.showStatus('En az 2 karakter girmelisiniz', 'error');
            return;
        }
        
        // Abort previous search if any
        this.fetchHelper.abort();
        
        this.currentSearch = query;
        
        // Reset filter state
        this.searchResultsByPlugin.clear();
        this.activeFilters.clear();
        
        // UI setup
        this.searchQueryDisplay.textContent = `"${query}"`;
        this.searchResults.style.display = 'block';
        this.pluginsList.style.display = 'none';
        this.resultsGrid.innerHTML = '';
        this.pluginFilters.style.display = 'none';
        this.filtersContainer.innerHTML = '';
        
        // Scroll to results
        scrollTo(this.searchResults);
        
        // Search state
        let completedSearches = 0;
        let totalResults = 0;
        
        this.showStatus(`${this.plugins.length} eklentide aranıyor...`, 'searching');
        
        // Add loading cards
        this.plugins.forEach(plugin => this.addLoadingCard(plugin.name));
        
        // Progressive search
        const searchPromises = this.plugins.map(plugin =>
            this.searchInPlugin(plugin.name, query, this.fetchHelper, { abortPrevious: false })
                .then(results => {
                    completedSearches++;
                    
                    if (results && results.length > 0) {
                        totalResults += results.length;
                        this.searchResultsByPlugin.set(plugin.name, results);
                        this.replaceLoadingWithResults(plugin.name, results);
                    } else {
                        this.removeLoadingCard(plugin.name);
                    }
                    
                    this.updateSearchStatus(completedSearches, this.plugins.length, totalResults);
                })
                .catch(error => {
                    if (error.name !== 'AbortError') {
                        console.error(`Error searching in ${plugin.name}:`, error);
                    }
                    completedSearches++;
                    this.removeLoadingCard(plugin.name);
                    this.updateSearchStatus(completedSearches, this.plugins.length, totalResults);
                })
        );
        
        await Promise.all(searchPromises);
        
        // Show filters only if this search is still the current one and we have results
        if (this.currentSearch === query && totalResults > 0) {
            this.renderFilters();
        }
    }
    
    /**
     * Search in a specific plugin
     * @param {string} pluginName - Plugin name
     * @param {string} query - Search query
     * @returns {Promise<Array>}
     */
    async searchInPlugin(pluginName, query, fetchHelper = null, fetchConfig = {}) {
        try {
            const url = `/api/v1/search?plugin=${encodeURIComponent(pluginName)}&query=${encodeURIComponent(query)}`;
            const usedHelper = fetchHelper || this.fetchHelper;
            const response = await usedHelper.fetch(url, {}, fetchConfig);
            
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
    
    /**
     * Add loading card for plugin
     * @param {string} pluginName - Plugin name
     */
    addLoadingCard(pluginName) {
        const loadingCard = document.createElement('div');
        loadingCard.className = 'loading-card';
        loadingCard.id = `loading-${pluginName}`;
        loadingCard.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <p>${escapeHtml(pluginName)}</p>
        `;
        this.resultsGrid.appendChild(loadingCard);
    }
    
    /**
     * Remove loading card
     * @param {string} pluginName - Plugin name
     */
    removeLoadingCard(pluginName) {
        const loadingCard = $(`#loading-${pluginName}`);
        if (loadingCard) {
            loadingCard.style.opacity = '0';
            setTimeout(() => loadingCard.remove(), 300);
        }
    }
    
    /**
     * Replace loading card with results
     * @param {string} pluginName - Plugin name
     * @param {Array} results - Search results
     */
    replaceLoadingWithResults(pluginName, results) {
        const loadingCard = $(`#loading-${pluginName}`);
        if (!loadingCard) return;
        
        results.forEach((result, index) => {
            const resultCard = this.createResultCard(pluginName, result);
            
            // Fade-in animation
            resultCard.style.opacity = '0';
            resultCard.style.transform = 'translateY(20px)';
            
            if (index === 0) {
                loadingCard.replaceWith(resultCard);
            } else {
                this.resultsGrid.appendChild(resultCard);
            }
            
            // Animate
            setTimeout(() => {
                resultCard.style.transition = 'all 0.4s ease-out';
                resultCard.style.opacity = '1';
                resultCard.style.transform = 'translateY(0)';
            }, index * 50);
        });
    }
    
    /**
     * Create result card element
     * @param {string} pluginName - Plugin name
     * @param {Object} result - Result data
     * @returns {Element}
     */
    createResultCard(pluginName, result) {
        const card = document.createElement('a');
        card.href = `/icerik/${encodeURIComponent(pluginName)}?url=${result.url}`;
        card.className = 'card';
        
        let cardContent = `<div class="plugin-badge">${escapeHtml(pluginName)}</div>`;
        
        if (result.poster) {
            cardContent += `<img src="${result.poster}" alt="${escapeHtml(result.title)}" class="card-image">`;
        }
        
        cardContent += `<div class="card-content">`;
        cardContent += `<h3 class="card-title">${escapeHtml(result.title)}</h3>`;
        cardContent += `</div>`;
        
        card.innerHTML = cardContent;
        return card;
    }
    
    /**
     * Update search status message
     * @param {number} completed - Completed searches
     * @param {number} total - Total searches
     * @param {number} resultsCount - Results count
     */
    updateSearchStatus(completed, total, resultsCount) {
        if (completed === total) {
            if (resultsCount === 0) {
                this.showNoResults();
            } else {
                this.showStatus(`${resultsCount} sonuç bulundu`, 'success');
            }
        } else {
            this.showStatus(`${completed}/${total} eklenti tarandı - ${resultsCount} sonuç`, 'searching');
        }
    }
    
    /**
     * Show no results message
     */
    showNoResults() {
        this.resultsGrid.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1;">
                <i class="fas fa-search"></i>
                <h3>Sonuç Bulunamadı</h3>
                <p>Arama kriterlerinize uygun içerik bulunamadı. Farklı bir terim deneyin.</p>
            </div>
        `;
        this.showStatus('Sonuç bulunamadı', 'error');
    }
    
    /**
     * Clear search and reset UI
     */
    clearSearch() {
        this.searchInput.value = '';
        this.searchResults.style.display = 'none';
        this.pluginsList.style.display = 'block';
        this.resultsGrid.innerHTML = '';
        this.showStatus('');
        this.searchInput.focus();
        
        // Reset filter state
        this.searchResultsByPlugin.clear();
        this.activeFilters.clear();
        this.pluginFilters.style.display = 'none';
        this.filtersContainer.innerHTML = '';
        
        // Abort ongoing searches
        this.fetchHelper.abort();
    }
    
    /**
     * Render plugin filters
     */
    renderFilters() {
        if (this.searchResultsByPlugin.size === 0) {
            this.pluginFilters.style.display = 'none';
            return;
        }
        
        this.filtersContainer.innerHTML = '';
        
        // Create filter buttons for plugins with results
        this.searchResultsByPlugin.forEach((results, pluginName) => {
            const filterButton = document.createElement('button');
            filterButton.type = 'button';
            filterButton.className = 'filter-button';
            filterButton.dataset.plugin = pluginName;
            filterButton.setAttribute('aria-pressed', 'false');
            filterButton.setAttribute('aria-label', `${pluginName} filtresi (${results.length} sonuç)`);
            
            filterButton.innerHTML = `
                <span>${escapeHtml(pluginName)}</span>
                <span class="filter-count">${results.length}</span>
            `;
            
            filterButton.addEventListener('click', () => this.toggleFilter(pluginName));
            
            this.filtersContainer.appendChild(filterButton);
        });
        
        this.pluginFilters.style.display = 'block';
    }
    
    /**
     * Toggle plugin filter
     * @param {string} pluginName - Plugin name to toggle
     */
    toggleFilter(pluginName) {
        if (this.activeFilters.has(pluginName)) {
            this.activeFilters.delete(pluginName);
        } else {
            this.activeFilters.add(pluginName);
        }
        
        this.updateFilterButtons();
        this.applyFilters();
    }
    
    /**
     * Clear all active filters
     */
    clearFilters() {
        this.activeFilters.clear();
        this.updateFilterButtons();
        this.applyFilters();
    }
    
    /**
     * Update filter button states
     */
    updateFilterButtons() {
        const buttons = $$('.filter-button', this.filtersContainer);
        buttons.forEach(button => {
            const pluginName = button.dataset.plugin;
            if (this.activeFilters.has(pluginName)) {
                addClass(button, 'active');
                button.setAttribute('aria-pressed', 'true');
            } else {
                removeClass(button, 'active');
                button.setAttribute('aria-pressed', 'false');
            }
        });
    }
    
    /**
     * Apply active filters to results
     */
    applyFilters() {
        this.resultsGrid.innerHTML = '';
        
        let visibleResults = 0;
        
        this.searchResultsByPlugin.forEach((results, pluginName) => {
            // Show results if no filters active or if plugin is in active filters
            if (this.activeFilters.size === 0 || this.activeFilters.has(pluginName)) {
                results.forEach(result => {
                    const card = this.createResultCard(pluginName, result);
                    this.resultsGrid.appendChild(card);
                    visibleResults++;
                });
            }
        });
        
        // Update status
        const totalResults = Array.from(this.searchResultsByPlugin.values())
            .reduce((sum, results) => sum + results.length, 0);
        
        if (this.activeFilters.size > 0) {
            this.showStatus(`${visibleResults}/${totalResults} sonuç gösteriliyor (${this.activeFilters.size} filtre aktif)`, 'success');
        } else {
            this.showStatus(`${totalResults} sonuç bulundu`, 'success');
        }
    }
    
    /**
     * Show status message
     * @param {string} message - Status message
     * @param {string} type - Status type (searching, success, error)
     */
    showStatus(message, type = '') {
        this.searchStatus.textContent = message;
        this.searchStatus.className = 'search-status';
        
        if (type) {
            addClass(this.searchStatus, type);
        }
    }
}
