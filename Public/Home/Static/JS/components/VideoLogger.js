// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

export default class VideoLogger {
    constructor(debugMode = false) {
        this.logs = [];
        this.debugMode = debugMode;
        this.maxLogs = 200;
        this.startTime = Date.now();

        if (debugMode) {
            const toggleBtn = document.getElementById('toggle-diagnostics');
            if (toggleBtn) {
                toggleBtn.style.display = 'block';
            }
        }
    }

    log(level, message, data = null) {
        const logEntry = {
            time: new Date().toISOString().substr(11, 8),
            elapsed: Math.round((Date.now() - this.startTime) / 10) / 100,
            level,
            message,
            data
        };

        this.logs.push(logEntry);

        // Maksimum log sayısını aşınca en eskisini sil
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Konsola yazdır
        if (this.debugMode) {
            const dataStr = data ? (typeof data === 'object' ? JSON.stringify(data) : data) : '';
            console[level.toLowerCase()](`[${logEntry.time}] [${level}] ${message}`, dataStr);
            this.updateDiagnosticsPanel();
        }

        return logEntry;
    }

    info(message, data = null) {
        return this.log('INFO', message, data);
    }

    warn(message, data = null) {
        return this.log('WARN', message, data);
    }

    error(message, data = null) {
        return this.log('ERROR', message, data);
    }

    clear() {
        this.logs = [];
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

    getLogs() {
        return this.logs;
    }

    getFormattedLogs() {
        return this.logs.map(entry => {
            const dataStr = entry.data ? (typeof entry.data === 'object' ?
                JSON.stringify(entry.data, null, 2) : entry.data) : '';
            return `[${entry.elapsed}s] [${entry.level}] ${entry.message}${dataStr ? ' ' + dataStr : ''}`;
        }).join('\n');
    }
}
