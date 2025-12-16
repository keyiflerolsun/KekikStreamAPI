// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import VideoLogger from './VideoLogger.min.js';

export default class VideoPlayer {
    constructor() {
        // Logger oluştur (debug modu açık)
        this.logger = new VideoLogger(true);

        // Global değişkenler (sınıf özellikleri olarak)
        this.currentHls = null;
        this.loadingTimeout = null;
        this.isLoadingVideo = false;
        this.videoData = [];
        this.retryCount = 0;
        this.maxRetries = 5;

        // DOM Elementleri
        this.videoPlayer = document.getElementById('video-player');
        this.videoLinksUI = document.getElementById('video-links-ui');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.toggleDiagnosticsBtn = document.getElementById('toggle-diagnostics');
        this.diagnosticsPanel = document.getElementById('diagnostics-panel');

        this.init();
    }

    init() {
        this.setupDiagnostics();
        this.collectVideoLinks();
        this.renderVideoLinks();
        this.loadHlsLibrary();
        this.setupGlobalErrorHandling();
    }

    setupDiagnostics() {
        if (this.toggleDiagnosticsBtn) {
            // Panel göster/gizle
            this.toggleDiagnosticsBtn.addEventListener('click', () => {
                if (this.diagnosticsPanel.style.display === 'none' || !this.diagnosticsPanel.style.display) {
                    this.diagnosticsPanel.style.display = 'block';
                    this.logger.updateDiagnosticsPanel();
                } else {
                    this.diagnosticsPanel.style.display = 'none';
                }
            });

            // Logları temizle
            document.getElementById('clear-logs').addEventListener('click', () => {
                this.logger.clear();
                this.logger.info('Loglar temizlendi');
            });

            // Logları kopyala
            document.getElementById('copy-logs').addEventListener('click', () => {
                const logText = this.logger.getFormattedLogs();
                navigator.clipboard.writeText(logText)
                    .then(() => {
                        this.logger.info('Loglar panoya kopyalandı');
                    })
                    .catch(err => {
                        this.logger.error('Kopyalama hatası', err.message);
                    });
            });

            // Logları indir
            document.getElementById('download-logs').addEventListener('click', () => {
                const logText = this.logger.getFormattedLogs();
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
                this.logger.info('Loglar indirildi');
            });
        }
    }

    collectVideoLinks() {
        this.logger.info('Video linkleri toplanıyor');
        const videoLinks = Array.from(document.querySelectorAll('.video-link-item'));
        this.videoData = videoLinks.map(link => {
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
                this.logger.error('Header parsing hatası', e.message);
            }

            return {
                name: link.dataset.name,
                url: link.dataset.url,
                referer: link.dataset.referer,
                headers: headers,
                subtitles: subtitles
            };
        });

        this.logger.info(`${this.videoData.length} video kaynağı bulundu`);
    }

    renderVideoLinks() {
        this.videoData.forEach((video, index) => {
            const linkButton = document.createElement('button');
            linkButton.className = 'button';
            linkButton.textContent = video.name;
            linkButton.onclick = () => {
                this.logger.clear();
                this.loadVideo(index);
            };
            this.videoLinksUI.appendChild(linkButton);
        });
    }

    cleanup() {
        // HLS instance'ı varsa temizle
        if (this.currentHls) {
            try {
                this.currentHls.destroy();
            } catch (e) {
                this.logger.error('HLS destroy hatası', e.message);
            }
            this.currentHls = null;
        }

        // Zaman aşımı varsa temizle
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }

        // Event listener'ları temizle - bind edilmiş fonksiyonları saklamadığımız için removeEventListener çalışmayabilir
        // Ancak yeni video yüklendiğinde video elementi sıfırlanıyor mu? Hayır.
        // Bu yüzden event listenerları düzgün temizlemek için referansları saklamamız gerekirdi.
        // Basitlik için video elementini klonlayıp değiştirmek bir yöntem olabilir ama şimdilik manuel temizleme deneyelim.
        // Not: Arrow function kullandığımız için removeEventListener zorlaşır.
        // Çözüm: Event listenerları sınıf metodu olarak tanımlayıp bind etmek.
        
        // Mevcut track'leri temizle
        while (this.videoPlayer.firstChild) {
            this.videoPlayer.removeChild(this.videoPlayer.firstChild);
        }
    }

    onVideoLoaded() {
        this.logger.info('Video metadata yüklendi');
    }

    onVideoCanPlay() {
        this.logger.info('Video oynatılabilir');
        this.loadingOverlay.style.display = 'none';

        // Timeout'u temizle
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }

        // Video oynatmayı dene
        if (this.videoPlayer.paused) {
            this.videoPlayer.play().catch(e => {
                this.logger.warn('Video otomatik başlatılamadı', e.message);
            });
        }
    }

    onVideoError() {
        const error = this.videoPlayer.error;
        this.loadingOverlay.style.display = 'none';

        // Timeout'u temizle
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }

        let errorMessage = 'Video yüklenirken bir hata oluştu.';
        let errorDetails = 'Bilinmeyen hata';

        if (error) {
            this.logger.error(`Video hatası: ${error.code}`, error);

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

    loadVideo(index) {
        // Önceki hata mesajlarını temizle
        document.querySelectorAll('.error-message').forEach(el => el.remove());

        // Video yükleniyor
        if (this.isLoadingVideo) {
            this.logger.info('Zaten bir video yükleniyor, lütfen bekleyin');
            return;
        }

        this.isLoadingVideo = true;
        this.logger.info(`Video yükleniyor: ${index}`, this.videoData[index]);

        // Önceki kaynakları temizle
        this.cleanup();

        const selectedVideo = this.videoData[index];

        // Loading overlay'i göster
        this.loadingOverlay.style.display = 'flex';

        // Yükleme zaman aşımı kontrolü ekle (45 saniye)
        this.loadingTimeout = setTimeout(() => {
            if (this.loadingOverlay.style.display === 'flex') {
                this.loadingOverlay.style.display = 'none';
                this.logger.error('Video yükleme zaman aşımı');

                // Hata mesajını göster
                const errorEl = document.createElement('div');
                errorEl.className = 'error-message';
                errorEl.innerHTML = '<strong>Video yükleme zaman aşımı</strong><br>Video yüklenirken zaman aşımı oluştu. Lütfen başka bir kaynak deneyin veya sayfayı yenileyin.';
                document.getElementById('video-player-container').insertAdjacentElement('afterend', errorEl);

                this.isLoadingVideo = false;
            }
        }, 45000);

        // Video ayarları
        this.videoPlayer.muted = false;

        // Event listener'ları ekle (bind ile context koru)
        // Not: removeEventListener için referansları saklamak daha iyi olurdu ama basitlik için
        // her loadVideo çağrısında video elementini temizleyip yeniden oluşturmak yerine
        // onVideoLoaded gibi metodları arrow function veya bind ile kullanıyoruz.
        // Ancak cleanup'ta remove edemiyoruz bu şekilde.
        // Daha temiz bir yaklaşım: video elementini klonla ve değiştir.
        const newVideoPlayer = this.videoPlayer.cloneNode(true);
        this.videoPlayer.parentNode.replaceChild(newVideoPlayer, this.videoPlayer);
        this.videoPlayer = newVideoPlayer;
        
        this.videoPlayer.addEventListener('loadedmetadata', () => this.onVideoLoaded());
        this.videoPlayer.addEventListener('canplay', () => this.onVideoCanPlay());
        this.videoPlayer.addEventListener('error', () => this.onVideoError());

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

        this.logger.info('Proxy URL oluşturuldu', proxyUrl);

        // Video formatını proxy'den Content-Type ile belirle
        this.logger.info('Video formatı tespit ediliyor (Content-Type sorgulanıyor)...');
        
        fetch(proxyUrl, { method: 'HEAD' })
            .then(response => {
                const contentType = response.headers.get('content-type') || '';
                this.logger.info(`Content-Type: ${contentType}`);
                
                // HLS mi kontrol et (proxy Content-Type'ı düzeltiyor)
                const isHLS = contentType.includes('mpegurl') || 
                              contentType.includes('application/vnd.apple.mpegurl') ||
                              contentType.includes('application/x-mpegurl');
                
                if (isHLS) {
                    this.loadHLSVideo(proxyUrl, originalUrl, referer, headers);
                } else {
                    this.loadNormalVideo(proxyUrl, originalUrl);
                }
            })
            .catch(error => {
                this.logger.error('Content-Type alınamadı, .m3u8 uzantısından tahmin ediliyor', error.message);
                
                // Fallback: sadece açık .m3u8 uzantıları
                if (originalUrl.includes('.m3u8')) {
                    this.loadHLSVideo(proxyUrl, originalUrl, referer, headers);
                } else {
                    this.loadNormalVideo(proxyUrl, originalUrl);
                }
            });

        // Altyazıları ekle
        if (selectedVideo.subtitles && selectedVideo.subtitles.length > 0) {
            this.logger.info(`${selectedVideo.subtitles.length} altyazı bulundu`);

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

                    this.videoPlayer.appendChild(track);
                    this.logger.info(`Altyazı eklendi: ${subtitle.name}`);
                } catch (error) {
                    this.logger.error(`Altyazı eklenirken hata: ${subtitle.name}`, error.message);
                }
            });
        }

        // Aktif buton stilini güncelle
        const allButtons = this.videoLinksUI.querySelectorAll('button');
        allButtons.forEach((btn, i) => {
            if (i === index) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Watch Party butonunun linkini güncelle
        const watchPartyButton = document.getElementById('watch-party-button');
        if (watchPartyButton) {
            const newRoomId = crypto.randomUUID().slice(0, 8).toUpperCase();
            const wpParams = new URLSearchParams();
            wpParams.set('url', selectedVideo.url);
            // Sayfa başlığını al (player-title elementinden)
            const playerTitleEl = document.querySelector('.player-title');
            const pageTitle = playerTitleEl ? playerTitleEl.textContent.trim() : document.title;
            wpParams.set('title', `${pageTitle} | ${selectedVideo.name}`);
            wpParams.set('user_agent', headers['User-Agent'] || navigator.userAgent);
            wpParams.set('referer', referer);
            
            // İlk altyazıyı ekle (varsa)
            if (selectedVideo.subtitles && selectedVideo.subtitles.length > 0) {
                wpParams.set('subtitle', selectedVideo.subtitles[0].url);
            }
            
            watchPartyButton.href = `http://party.kekikakademi.org/watch-party/${newRoomId}?${wpParams.toString()}`;
        }

        // Video yükleme tamamlandı (asenkron işlemler devam edebilir ama UI hazır)
        this.isLoadingVideo = false;
    }

    loadHLSVideo(proxyUrl, originalUrl, referer, headers) {
        this.logger.info('HLS video formatı tespit edildi');
        this.retryCount = 0; // Reset retry count for new video

        // HLS video için
        if (Hls.isSupported()) {
            this.logger.info('HLS.js destekleniyor, yükleniyor');

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
                    xhrSetup: (xhr, url) => {
                        try {
                            // URL'nin zaten bir proxy URL'i olup olmadığını kontrol et
                            if (url.includes('/proxy/video') && url.includes(window.location.hostname)) {
                                // Zaten proxy URL'i olduğu için değiştirme
                                xhr.open('GET', url, true);
                                return;
                            }

                            // URL protokol kontrolü
                            if (url.startsWith('http')) {
                                this.logger.info('Segment URL yakalandı', url);

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
                                    this.logger.info('Segment URL düzeltildi', { original: url, new: newUrl });
                                }

                                // Proxy URL'i oluştur
                                const newProxyUrl = `/proxy/video?url=${encodeURIComponent(newUrl)}&referer=${encodeURIComponent(referer)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                                xhr.open('GET', newProxyUrl, true);
                            }
                        } catch (error) {
                            this.logger.error('xhrSetup hatası', error.message);
                            // Hata durumunda orijinal URL'yi kullan
                            const fallbackUrl = `/proxy/video?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                            xhr.open('GET', fallbackUrl, true);
                        }
                    }
                };

                const hls = new Hls(hlsConfig);
                this.currentHls = hls;

                // HLS hata olaylarını dinle
                hls.on(Hls.Events.ERROR, (event, data) => {
                    this.logger.error('HLS hatası', data);

                    if (data.fatal) {
                        this.retryCount++;
                        this.logger.warn(`HLS hatası (Deneme: ${this.retryCount}/${this.maxRetries})`, data);

                        if (this.retryCount > this.maxRetries) {
                            this.logger.error('Maksimum yeniden deneme sayısına ulaşıldı, işlem durduruluyor.');
                            this.cleanup();
                            this.onVideoError();
                            return;
                        }

                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                // Ağ hatası, yeniden deneyebiliriz
                                this.logger.info('Ağ hatası, yeniden deneniyor...');
                                hls.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                // Medya hatası, recover dene
                                this.logger.info('Medya hatası, kurtarılmaya çalışılıyor...');
                                hls.recoverMediaError();
                                break;
                            default:
                                // Geri kurtarılamaz hata
                                this.cleanup();
                                this.onVideoError();
                                break;
                        }
                    }
                });

                // Manifest yüklendiğinde oynatmaya başla
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    this.logger.info('HLS manifest başarıyla analiz edildi');
                    this.retryCount = 0; // Başarılı bağlantıda sayacı sıfırla
                });

                hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
                    this.logger.info('HLS seviyesi yüklendi', {
                        level: data.level,
                        bitrate: data.details ? data.details.bitrate : 'bilinmiyor'
                    });
                });

                // HLS kaynağını yükle
                hls.loadSource(proxyUrl);
                hls.attachMedia(this.videoPlayer);
            } catch (error) {
                this.logger.error('HLS yükleme hatası', error.message);
                this.onVideoError();
            }
        } else if (this.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS desteği var (Safari, iOS)
            this.logger.info('Native HLS desteği kullanılıyor');

            try {
                this.videoPlayer.src = proxyUrl;
            } catch (error) {
                this.logger.error('Native HLS yükleme hatası', error.message);
                this.onVideoError();
            }
        } else {
            this.logger.error('Bu tarayıcı HLS formatını desteklemiyor');
            this.onVideoError();
        }
    }

    loadNormalVideo(proxyUrl, originalUrl) {
        this.logger.info('Normal video formatı yükleniyor');

        try {
            // MKV dosyaları için ek seçenekler
            if (originalUrl.includes('.mkv')) {
                this.videoPlayer.setAttribute('type', 'video/x-matroska');
                this.logger.info('MKV formatı tespit edildi');
            }

            this.videoPlayer.src = proxyUrl;
        } catch (error) {
            this.logger.error('Video yükleme hatası', error.message);
            this.onVideoError();
        }
    }

    loadHlsLibrary() {
        this.logger.info('HLS.js yükleniyor');
        const hlsScript = document.createElement('script');
        hlsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js';
        hlsScript.onload = () => {
            this.logger.info('HLS.js yüklendi');
            // Sayfa yüklendiğinde ilk videoyu yükle (HLS.js yüklendikten sonra)
            if (this.videoData.length > 0) {
                this.loadVideo(0);
            } else {
                this.logger.warn('Hiç video kaynağı bulunamadı');
            }
        };
        hlsScript.onerror = () => {
            this.logger.error('HLS.js yüklenemedi');
            // Hata mesajını göster
            const errorEl = document.createElement('div');
            errorEl.className = 'error-message';
            errorEl.innerHTML = '<strong>HLS.js yüklenemedi</strong><br>Video oynatıcı bileşeni yüklenemedi. Lütfen sayfayı yenileyin veya farklı bir tarayıcı deneyin.';
            document.getElementById('video-player-container').insertAdjacentElement('afterend', errorEl);
        };
        document.head.appendChild(hlsScript);
    }

    setupGlobalErrorHandling() {
        // Video player hata yönetimi - genel hatalar
        this.videoPlayer.addEventListener('error', (e) => {
            this.logger.error('Video Player genel hatası', e);
        });
    }
}
