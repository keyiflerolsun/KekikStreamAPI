// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { Logger } from '../utils/logger.min.js';

export default class VideoLogger extends Logger {
    constructor(debugMode = false) {
        super(debugMode);
        this.lastLog = null;
        
        if (debugMode) {
            const toggleBtn = document.getElementById('toggle-diagnostics');
            if (toggleBtn) {
                toggleBtn.style.display = 'block';
            }
        }
    }

    log(level, message, data = null) {
        // Duplicate check
        if (this.lastLog && 
            this.lastLog.level === level && 
            this.lastLog.message === message) {
            
            this.lastLog.count++;
            
            // Update last entry
            if (this.logs.length > 0) {
                const lastEntry = this.logs[this.logs.length - 1];
                lastEntry.count = this.lastLog.count;
                // Update timestamp to show latest occurrence
                lastEntry.time = new Date().toISOString().substr(11, 8);
                lastEntry.elapsed = Math.round((Date.now() - this.startTime) / 10) / 100;
            }
            
            if (this.debugMode) {
                this.updateDiagnosticsPanel();
            }
            
            return this.logs[this.logs.length - 1];
        }

        // Reset last log
        this.lastLog = { level, message, count: 1 };

        // Info loglarını konsola basmayı engellemek için geçici olarak debug modunu kapat
        const originalDebugMode = this.debugMode;
        if (this.debugMode && level === 'INFO') {
            this.debugMode = false;
        }

        // Call parent log method
        const logEntry = super.log(level, message, data);
        logEntry.count = 1;
        
        // Debug modunu geri yükle
        this.debugMode = originalDebugMode;
        
        // Update UI if debug mode is on
        if (this.debugMode) {
            this.updateDiagnosticsPanel();
        }

        return logEntry;
    }

    clear() {
        super.clear();
        this.updateDiagnosticsPanel();
    }

    updateDiagnosticsPanel() {
        const logEl = document.getElementById('diagnostics-log');
        if (!logEl) return;

        logEl.innerHTML = this.logs.map(entry => {
            const levelClass = `log-entry-${entry.level.toLowerCase()}`;

            // Veriyi biçimlendir
            let dataHtml = '';
            if (entry.data) {
                const dataStr = typeof entry.data === 'object' ?
                    JSON.stringify(entry.data, null, 2) : entry.data;
                if (dataStr && dataStr.trim()) {
                    dataHtml = `<div class="log-entry-data">${dataStr}</div>`;
                }
            }

            return `<div class="log-entry">
                <div class="log-entry-header">
                    <span class="log-entry-time">[${entry.elapsed}s]</span>
                    <span class="${levelClass}">[${entry.level}]</span>
                    <span class="log-entry-message">${entry.message} ${entry.count > 1 ? `(x${entry.count})` : ''}</span>
                </div>
                ${dataHtml}
            </div>`;
        }).join('');

        // Otomatik scroll
        logEl.scrollTop = logEl.scrollHeight;
    }
}
