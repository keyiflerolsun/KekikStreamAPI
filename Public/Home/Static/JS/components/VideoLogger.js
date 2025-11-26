// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { Logger } from '../utils/logger.min.js';

export default class VideoLogger extends Logger {
    constructor(debugMode = false) {
        super(debugMode);
        
        if (debugMode) {
            const toggleBtn = document.getElementById('toggle-diagnostics');
            if (toggleBtn) {
                toggleBtn.style.display = 'block';
            }
        }
    }

    log(level, message, data = null) {
        // Call parent log method
        const logEntry = super.log(level, message, data);
        
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
                    <span class="log-entry-message">${entry.message}</span>
                </div>
                ${dataHtml}
            </div>`;
        }).join('');

        // Otomatik scroll
        logEl.scrollTop = logEl.scrollHeight;
    }
}
