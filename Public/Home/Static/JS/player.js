document.addEventListener('DOMContentLoaded', function () {
    // Logger sistemi
    class VideoLogger {
        constructor(debugMode = false) {
            this.logs = [];
            this.debugMode = debugMode;
            this.maxLogs = 200;
            this.startTime = Date.now();

            if (debugMode) {
                document.getElementById('toggle-diagnostics').style.display = 'block';
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

    // Değişkenleri tanımla
    const videoPlayer = document.getElementById('video-player');
    const videoLinksUI = document.getElementById('video-links-ui');
    const loadingOverlay = document.getElementById('loading-overlay');
    const toggleDiagnosticsBtn = document.getElementById('toggle-diagnostics');
    const diagnosticsPanel = document.getElementById('diagnostics-panel');

    // Tanılama paneli işlevleri
    if (toggleDiagnosticsBtn) {
        // Panel göster/gizle
        toggleDiagnosticsBtn.addEventListener('click', function () {
            if (diagnosticsPanel.style.display === 'none' || !diagnosticsPanel.style.display) {
                diagnosticsPanel.style.display = 'block';
                logger.updateDiagnosticsPanel();
            } else {
                diagnosticsPanel.style.display = 'none';
            }
        });

        // Logları temizle
        document.getElementById('clear-logs').addEventListener('click', function () {
            logger.clear();
            logger.info('Loglar temizlendi');
        });

        // Logları kopyala
        document.getElementById('copy-logs').addEventListener('click', function () {
            const logText = logger.getFormattedLogs();
            navigator.clipboard.writeText(logText)
                .then(() => {
                    logger.info('Loglar panoya kopyalandı');
                })
                .catch(err => {
                    logger.error('Kopyalama hatası', err.message);
                });
        });

        // Logları indir
        document.getElementById('download-logs').addEventListener('click', function () {
            const logText = logger.getFormattedLogs();
            const blob = new Blob([logText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `video-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            logger.info('Loglar indirildi');
        });
    }

    // Logger oluştur (debug modu açık)
    const logger = new VideoLogger(true);

    // Global değişkenler
    window.currentHls = null;
    window.loadingTimeout = null;
    window.isLoadingVideo = false;

    // Video linkleri veri elementlerini topla
    logger.info('Video linkleri toplanıyor');
    const videoLinks = Array.from(document.querySelectorAll('.video-link-item'));
    const videoData = videoLinks.map(link => {
        // Altyazıları topla
        const subtitles = Array.from(link.querySelectorAll('.subtitle-item')).map(sub => {
            return {
                name: sub.dataset.name,
                url: sub.dataset.url
            };
        });

        // JSON.parse işlemini try-catch ile güvenli yap
        let headers = {};
        try {
            headers = JSON.parse(link.dataset.headers || '{}');
        } catch (e) {
            logger.error('Header parsing hatası', e.message);
        }

        return {
            name: link.dataset.name,
            url: link.dataset.url,
            referer: link.dataset.referer,
            headers: headers,
            subtitles: subtitles
        };
    });

    logger.info(`${videoData.length} video kaynağı bulundu`);

    // UI'a tıklanabilir videolar ekle
    videoData.forEach((video, index) => {
        const linkButton = document.createElement('button');
        linkButton.className = 'button';
        linkButton.textContent = video.name;
        linkButton.onclick = function () {
            logger.clear();
            loadVideo(index);
        };
        videoLinksUI.appendChild(linkButton);
    });

    // Temizleme fonksiyonu
    function cleanup() {
        // HLS instance'ı varsa temizle
        if (window.currentHls) {
            try {
                window.currentHls.destroy();
            } catch (e) {
                logger.error('HLS destroy hatası', e.message);
            }
            window.currentHls = null;
        }

        // Zaman aşımı varsa temizle
        if (window.loadingTimeout) {
            clearTimeout(window.loadingTimeout);
            window.loadingTimeout = null;
        }

        // Event listener'ları temizle
        try {
            videoPlayer.removeEventListener('loadedmetadata', onVideoLoaded);
            videoPlayer.removeEventListener('error', onVideoError);
            videoPlayer.removeEventListener('canplay', onVideoCanPlay);
        } catch (e) {
            logger.error('Event listener temizleme hatası', e.message);
        }

        // Mevcut track'leri temizle
        while (videoPlayer.firstChild) {
            videoPlayer.removeChild(videoPlayer.firstChild);
        }
    }

    // Video yükleme olayı
    function onVideoLoaded() {
        logger.info('Video metadata yüklendi');
    }

    // Video oynatma olayı
    function onVideoCanPlay() {
        logger.info('Video oynatılabilir');
        loadingOverlay.style.display = 'none';

        // Timeout'u temizle
        if (window.loadingTimeout) {
            clearTimeout(window.loadingTimeout);
            window.loadingTimeout = null;
        }

        // Video oynatmayı dene
        if (videoPlayer.paused) {
            videoPlayer.play().catch(e => {
                logger.warn('Video otomatik başlatılamadı', e.message);
            });
        }
    }

    // Video hatası olayı
    function onVideoError() {
        const error = videoPlayer.error;
        loadingOverlay.style.display = 'none';

        // Timeout'u temizle
        if (window.loadingTimeout) {
            clearTimeout(window.loadingTimeout);
            window.loadingTimeout = null;
        }

        let errorMessage = 'Video yüklenirken bir hata oluştu.';
        let errorDetails = 'Bilinmeyen hata';

        if (error) {
            logger.error(`Video hatası: ${error.code}`, error);

            switch (error.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    errorDetails = 'Yükleme kullanıcı tarafından iptal edildi.';
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    errorDetails = 'Ağ hatası nedeniyle yükleme başarısız oldu.';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    errorDetails = 'Video dosyası bozuk veya desteklenmeyen formatta.';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorDetails = 'Video formatı desteklenmiyor.';
                    break;
            }
        }

        // Hata mesajını kullanıcıya göster
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.innerHTML = `<strong>${errorMessage}</strong><br>${errorDetails}<br>Lütfen başka bir kaynak deneyin.`;

        // Önceki hata mesajlarını temizle
        document.querySelectorAll('.error-message').forEach(el => el.remove());

        // Hata mesajını oynatıcı altına ekle
        document.getElementById('video-player-container').insertAdjacentElement('afterend', errorEl);
    }

    // Video yükle ve oynat
    function loadVideo(index) {
        // Önceki hata mesajlarını temizle
        document.querySelectorAll('.error-message').forEach(el => el.remove());

        // Video yükleniyor
        if (window.isLoadingVideo) {
            logger.info('Zaten bir video yükleniyor, lütfen bekleyin');
            return;
        }

        window.isLoadingVideo = true;
        logger.info(`Video yükleniyor: ${index}`, videoData[index]);

        // Önceki kaynakları temizle
        cleanup();

        const selectedVideo = videoData[index];

        // Loading overlay'i göster
        loadingOverlay.style.display = 'flex';

        // Yükleme zaman aşımı kontrolü ekle (45 saniye)
        window.loadingTimeout = setTimeout(() => {
            if (loadingOverlay.style.display === 'flex') {
                loadingOverlay.style.display = 'none';
                logger.error('Video yükleme zaman aşımı');

                // Hata mesajını göster
                const errorEl = document.createElement('div');
                errorEl.className = 'error-message';
                errorEl.innerHTML = '<strong>Video yükleme zaman aşımı</strong><br>Video yüklenirken zaman aşımı oluştu. Lütfen başka bir kaynak deneyin veya sayfayı yenileyin.';
                document.getElementById('video-player-container').insertAdjacentElement('afterend', errorEl);

                window.isLoadingVideo = false;
            }
        }, 45000);

        // Video ayarları
        videoPlayer.muted = false;

        // Event listener'ları ekle
        videoPlayer.addEventListener('loadedmetadata', onVideoLoaded);
        videoPlayer.addEventListener('canplay', onVideoCanPlay);
        videoPlayer.addEventListener('error', onVideoError);

        // Orijinal URL'i al
        const originalUrl = selectedVideo.url;
        // Referer bilgisini al
        const referer = selectedVideo.referer || window.location.href;
        const headers = selectedVideo.headers || {};

        // Proxy URL'i oluştur
        let proxyUrl = `/proxy/video?url=${encodeURIComponent(originalUrl)}`;
        if (referer) {
            proxyUrl += `&referer=${encodeURIComponent(referer)}`;
        }
        if (headers) {
            proxyUrl += `&headers=${encodeURIComponent(JSON.stringify(headers))}`;
        }

        logger.info('Proxy URL oluşturuldu', proxyUrl);

        // Video formatını proxy'den Content-Type ile belirle
        logger.info('Video formatı tespit ediliyor (Content-Type sorgulanıyor)...');
        
        fetch(proxyUrl, { method: 'HEAD' })
            .then(response => {
                const contentType = response.headers.get('content-type') || '';
                logger.info(`Content-Type: ${contentType}`);
                
                // HLS mi kontrol et (proxy Content-Type'ı düzeltiyor)
                const isHLS = contentType.includes('mpegurl') || 
                              contentType.includes('application/vnd.apple.mpegurl') ||
                              contentType.includes('application/x-mpegurl');
                
                if (isHLS) {
                    loadHLSVideo();
                } else {
                    loadNormalVideo();
                }
            })
            .catch(error => {
                logger.error('Content-Type alınamadı, .m3u8 uzantısından tahmin ediliyor', error.message);
                
                // Fallback: sadece açık .m3u8 uzantıları
                if (originalUrl.includes('.m3u8')) {
                    loadHLSVideo();
                } else {
                    loadNormalVideo();
                }
            });
        
        // HLS video yükleme fonksiyonu
        function loadHLSVideo() {
            logger.info('HLS video formatı tespit edildi');

            // HLS video için
            if (Hls.isSupported()) {
                logger.info('HLS.js destekleniyor, yükleniyor');

                try {
                    // HLS.js yapılandırması
                    const hlsConfig = {
                        capLevelToPlayerSize: true,
                        maxLoadingDelay: 4,
                        minAutoBitrate: 0,
                        maxBufferLength: 30,
                        maxMaxBufferLength: 600,
                        startLevel: -1, // Otomatik kalite seçimi
                        // Segment yüklemeleri için proxy kullanma
                        xhrSetup: function (xhr, url) {
                            try {
                                // URL'nin zaten bir proxy URL'i olup olmadığını kontrol et
                                if (url.includes('/proxy/video') && url.includes(window.location.hostname)) {
                                    // Zaten proxy URL'i olduğu için değiştirme
                                    xhr.open('GET', url, true);
                                    return;
                                }

                                // URL protokol kontrolü
                                if (url.startsWith('http')) {
                                    logger.info('Segment URL yakalandı', url);

                                    // URL işleme için daha güvenilir yöntem
                                    let newUrl = url;
                                    const originalVideoUrl = new URL(originalUrl);

                                    // Göreceli URL'leri işle
                                    if (!url.includes('://')) {
                                        // URL'nin başında / varsa, origin kullan, yoksa tam path kullan
                                        if (url.startsWith('/')) {
                                            newUrl = originalVideoUrl.origin + url;
                                        } else {
                                            const baseUrl = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
                                            newUrl = baseUrl + url;
                                        }
                                    }
                                    // Sunucuya yönlendirilen istekleri işle - ancak zaten proxy URL'leri hariç tut
                                    else if (url.includes(window.location.hostname) && !url.includes('/proxy/video')) {
                                        // URL'yi ayrıştır
                                        const urlObj = new URL(url);
                                        const pathParts = urlObj.pathname.split('/');
                                        const filename = pathParts[pathParts.length - 1];

                                        // urlset dizini için özel işleme
                                        if (originalUrl.includes('.urlset/')) {
                                            const urlsetIndex = originalUrl.indexOf('.urlset/');
                                            if (urlsetIndex !== -1) {
                                                const urlsetBase = originalUrl.substring(0, urlsetIndex + 8);
                                                newUrl = urlsetBase + filename + urlObj.search;
                                            }
                                        } else {
                                            // Orijinal URL'den base path çıkar
                                            const basePath = originalVideoUrl.pathname.substring(0, originalVideoUrl.pathname.lastIndexOf('/') + 1);
                                            newUrl = originalVideoUrl.origin + basePath + filename + urlObj.search;
                                        }
                                    }

                                    if (newUrl !== url) {
                                        logger.info('Segment URL düzeltildi', { original: url, new: newUrl });
                                    }

                                    // Proxy URL'i oluştur
                                    const newProxyUrl = `/proxy/video?url=${encodeURIComponent(newUrl)}&referer=${encodeURIComponent(referer)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                                    xhr.open('GET', newProxyUrl, true);
                                }
                            } catch (error) {
                                logger.error('xhrSetup hatası', error.message);
                                // Hata durumunda orijinal URL'yi kullan
                                const fallbackUrl = `/proxy/video?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                                xhr.open('GET', fallbackUrl, true);
                            }
                        }
                    };

                    const hls = new Hls(hlsConfig);
                    window.currentHls = hls;

                    // HLS hata olaylarını dinle
                    hls.on(Hls.Events.ERROR, function (event, data) {
                        logger.error('HLS hatası', data);

                        if (data.fatal) {
                            logger.error('Kritik HLS hatası, oynatıcı yeniden başlatılıyor', data);

                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    // Ağ hatası, yeniden deneyebiliriz
                                    hls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    // Medya hatası, recover dene
                                    hls.recoverMediaError();
                                    break;
                                default:
                                    // Geri kurtarılamaz hata
                                    cleanup();
                                    onVideoError();
                                    break;
                            }
                        }
                    });

                    // Manifest yüklendiğinde oynatmaya başla
                    hls.on(Hls.Events.MANIFEST_PARSED, function () {
                        logger.info('HLS manifest başarıyla analiz edildi');
                    });

                    hls.on(Hls.Events.LEVEL_LOADED, function (event, data) {
                        logger.info('HLS seviyesi yüklendi', {
                            level: data.level,
                            bitrate: data.details ? data.details.bitrate : 'bilinmiyor'
                        });
                    });

                    // HLS kaynağını yükle
                    hls.loadSource(proxyUrl);
                    hls.attachMedia(videoPlayer);
                } catch (error) {
                    logger.error('HLS yükleme hatası', error.message);
                    onVideoError();
                }
            } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS desteği var (Safari, iOS)
                logger.info('Native HLS desteği kullanılıyor');

                try {
                    videoPlayer.src = proxyUrl;
                } catch (error) {
                    logger.error('Native HLS yükleme hatası', error.message);
                    onVideoError();
                }
            } else {
                logger.error('Bu tarayıcı HLS formatını desteklemiyor');
                onVideoError();
            }
        }
        
        // Normal video yükleme fonksiyonu
        function loadNormalVideo() {
            logger.info('Normal video formatı yükleniyor');

            try {
                // MKV dosyaları için ek seçenekler
                if (originalUrl.includes('.mkv')) {
                    videoPlayer.setAttribute('type', 'video/x-matroska');
                    logger.info('MKV formatı tespit edildi');
                }

                videoPlayer.src = proxyUrl;
            } catch (error) {
                logger.error('Video yükleme hatası', error.message);
                onVideoError();
            }
        }

        // Altyazıları ekle
        if (selectedVideo.subtitles && selectedVideo.subtitles.length > 0) {
            logger.info(`${selectedVideo.subtitles.length} altyazı bulundu`);

            selectedVideo.subtitles.forEach(subtitle => {
                try {
                    // Altyazı proxy URL'ini oluştur
                    const subtitleProxyUrl = `/proxy/subtitle?url=${encodeURIComponent(subtitle.url)}&referer=${encodeURIComponent(referer)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;

                    // Altyazı track elementini oluştur
                    const track = document.createElement('track');
                    track.kind = 'subtitles';
                    track.label = subtitle.name;
                    track.srclang = subtitle.name.toLowerCase();
                    track.src = subtitleProxyUrl; // Proxy URL'ini kullan

                    // FORCED veya TR altyazıları varsayılan olarak aç
                    if (subtitle.name === 'FORCED' || subtitle.name === 'TR') {
                        track.default = true;
                    }

                    videoPlayer.appendChild(track);
                    logger.info(`Altyazı eklendi: ${subtitle.name}`);
                } catch (error) {
                    logger.error(`Altyazı eklenirken hata: ${subtitle.name}`, error.message);
                }
            });
        }

        // Aktif buton stilini güncelle
        const allButtons = videoLinksUI.querySelectorAll('button');
        allButtons.forEach((btn, i) => {
            if (i === index) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Video yükleme tamamlandı
        window.isLoadingVideo = false;
    }

    // HLS.js entegrasyonu için script ekle
    logger.info('HLS.js yükleniyor');
    const hlsScript = document.createElement('script');
    hlsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js';
    hlsScript.onload = function () {
        logger.info('HLS.js yüklendi');
        // Sayfa yüklendiğinde ilk videoyu yükle (HLS.js yüklendikten sonra)
        if (videoData.length > 0) {
            loadVideo(0);
        } else {
            logger.warn('Hiç video kaynağı bulunamadı');
        }
    };
    hlsScript.onerror = function () {
        logger.error('HLS.js yüklenemedi');
        // Hata mesajını göster
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.innerHTML = '<strong>HLS.js yüklenemedi</strong><br>Video oynatıcı bileşeni yüklenemedi. Lütfen sayfayı yenileyin veya farklı bir tarayıcı deneyin.';
        document.getElementById('video-player-container').insertAdjacentElement('afterend', errorEl);
    };
    document.head.appendChild(hlsScript);

    // Video player hata yönetimi - genel hatalar
    videoPlayer.addEventListener('error', function (e) {
        logger.error('Video Player genel hatası', e);
    });
});