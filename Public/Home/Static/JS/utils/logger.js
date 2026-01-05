// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

export class Logger {
    constructor(debugMode = false, maxLogs = 200) {
        this.logs = [];
        this.debugMode = debugMode;
        this.maxLogs = maxLogs;
        this.startTime = Date.now();
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
        
        // Keep only maxLogs
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // Console output in debug mode
        if (this.debugMode) {
            const dataStr = data ? (typeof data === 'object' ? JSON.stringify(data) : data) : '';
            console[level.toLowerCase()](`[${logEntry.time}] [${level}] ${message}`, dataStr);
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
    }
    
    getLogs() {
        return this.logs;
    }
    
    getFormattedLogs() {
        return this.logs.map(entry => {
            const dataStr = entry.data ? 
                (typeof entry.data === 'object' ? 
                    JSON.stringify(entry.data, null, 2) : entry.data) : '';
            return `[${entry.elapsed}s] [${entry.level}] ${entry.message}${dataStr ? ' ' + dataStr : ''}`;
        }).join('\n');
    }
    
    exportLogs(filename = null) {
        const logText = this.getFormattedLogs();
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
}

export function createConsoleLogger(prefix = '') {
    return {
        info: (msg, ...args) => console.log(`[${prefix}] ${msg}`, ...args),
        warn: (msg, ...args) => console.warn(`[${prefix}] ${msg}`, ...args),
        error: (msg, ...args) => console.error(`[${prefix}] ${msg}`, ...args)
    };
}
