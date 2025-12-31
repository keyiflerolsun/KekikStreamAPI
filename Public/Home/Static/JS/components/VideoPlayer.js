// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import VideoLogger from './VideoLogger.min.js';
import { detectGoServices, buildProxyUrl as buildServiceProxyUrl, getProxyBaseUrl } from '/static/shared/JS/service-detector.min.js';

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
        this.lastLoadedBaseUrl = null; // HLS segment URL'leri için base URL takibi
        this.lastLoadedOrigin = null; // HLS absolute path'leri için origin takibi

        // DOM Elementleri
        this.videoPlayer = document.getElementById('video-player');
        this.videoLinksUI = document.getElementById('video-links-ui');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.toggleDiagnosticsBtn = document.getElementById('toggle-diagnostics');
        this.diagnosticsPanel = document.getElementById('diagnostics-panel');

        this.init();
    }

    // Proxy URL oluşturucu (Go/Python fallback destekli)
    buildProxyUrl(url, userAgent = '', referer = '', endpoint = 'video') {
        return buildServiceProxyUrl(url, userAgent, referer, endpoint);
    }

    async init() {
        // Go servislerini tespit et (fallback için)
        await detectGoServices();
        
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
                
                // Clipboard API kullanılabilir mi kontrol et (HTTPS veya localhost gerektirir)
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(logText)
                        .then(() => {
                            this.logger.info('Loglar panoya kopyalandı');
                        })
                        .catch(err => {
                            this.logger.error('Kopyalama hatası', err.message);
                        });
                } else {
                    // Fallback: execCommand kullan (HTTP için)
                    try {
                        const textArea = document.createElement('textarea');
                        textArea.value = logText;
                        textArea.style.position = 'fixed';
                        textArea.style.left = '-9999px';
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        this.logger.info('Loglar panoya kopyalandı');
                    } catch (err) {
                        this.logger.error('Kopyalama hatası', err.message);
                    }
                }
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

            return {
                name: link.dataset.name,
                url: link.dataset.url,
                referer: link.dataset.referer,
                userAgent: link.dataset.userAgent,
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
        // Referer ve userAgent bilgilerini al (boşsa fallback kullanma)
        const referer = selectedVideo.referer || '';
        const userAgent = selectedVideo.userAgent || '';

        // Proxy URL'i oluştur (Go/Python fallback destekli)
        let proxyUrl = this.buildProxyUrl(originalUrl, userAgent, referer, 'video');

        this.logger.info('Proxy URL oluşturuldu', proxyUrl);

        // URL'den format tespiti (player-core.js ile uyumlu)
        const detectFormatFromUrl = (url) => {
            const lowerUrl = url.toLowerCase();
            if (lowerUrl.includes('.m3u8') || lowerUrl.includes('/hls/') || lowerUrl.includes('/m3u8/')) return 'hls';
            if (lowerUrl.includes('.mp4') || lowerUrl.includes('/mp4/')) return 'mp4';
            if (lowerUrl.includes('.mkv')) return 'mkv';
            if (lowerUrl.includes('.webm')) return 'webm';
            return 'native';
        };

        // Video formatını proxy'den Content-Type ile belirle
        this.logger.info('Video formatı tespit ediliyor (Content-Type sorgulanıyor)...');
        
        fetch(proxyUrl, { method: 'HEAD' })
            .then(response => {
                const contentType = response.headers.get('content-type') || '';
                this.logger.info(`Content-Type: ${contentType}`);
                
                // Content-Type'dan HLS kontrolü
                const isHLSByContentType = contentType.includes('mpegurl') || 
                                           contentType.includes('mpeg');
                
                // URL pattern'den HLS kontrolü (Content-Type boş veya yanlışsa fallback)
                const urlFormat = detectFormatFromUrl(originalUrl);
                const isHLSByUrl = urlFormat === 'hls';
                
                this.logger.info(`Format tespiti: Content-Type=${isHLSByContentType ? 'HLS' : 'other'}, URL=${urlFormat}`);
                
                // Content-Type veya URL'den biri HLS ise HLS olarak yükle
                if (isHLSByContentType || isHLSByUrl) {
                    this.loadHLSVideo(originalUrl, referer, userAgent);
                } else {
                    this.loadNormalVideo(proxyUrl, originalUrl);
                }
            })
            .catch(error => {
                this.logger.error('Content-Type alınamadı, URL pattern ile tahmin ediliyor', error.message);
                
                // Fallback: URL pattern'den format tespiti
                const urlFormat = detectFormatFromUrl(originalUrl);
                if (urlFormat === 'hls') {
                    this.loadHLSVideo(originalUrl, referer, userAgent);
                } else {
                    this.loadNormalVideo(proxyUrl, originalUrl);
                }
            });

        // Altyazıları ekle
        if (selectedVideo.subtitles && selectedVideo.subtitles.length > 0) {
            this.logger.info(`${selectedVideo.subtitles.length} altyazı bulundu`);

            selectedVideo.subtitles.forEach(subtitle => {
                try {
                    // Altyazı proxy URL'ini oluştur (Go/Python fallback destekli)
                    let subtitleProxyUrl = this.buildProxyUrl(subtitle.url, userAgent, referer, 'subtitle');

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
            // Math.random() tabanlı ID (HTTP ve tüm tarayıcılarda çalışır)
            const newRoomId = Math.random().toString(36).substring(2, 10).toUpperCase();
            const wpParams = new URLSearchParams();
            wpParams.set('url', selectedVideo.url);
            // Sayfa başlığını al (player-title elementinden)
            const playerTitleEl = document.querySelector('.player-title');
            const pageTitle = playerTitleEl ? playerTitleEl.textContent.trim() : document.title;
            wpParams.set('title', `${pageTitle} | ${selectedVideo.name}`);
            wpParams.set('user_agent', userAgent || '');
            wpParams.set('referer', referer || '');

            // İlk altyazıyı ekle (varsa)
            if (selectedVideo.subtitles && selectedVideo.subtitles.length > 0) {
                wpParams.set('subtitle', selectedVideo.subtitles[0].url);
            }
            
            watchPartyButton.href = `${window.location.origin}/watch-party/${newRoomId}?${wpParams.toString()}`;
        }

        // Video yükleme tamamlandı (asenkron işlemler devam edebilir ama UI hazır)
        this.isLoadingVideo = false;
    }

    loadHLSVideo(originalUrl, referer, userAgent) {
        this.logger.info('HLS video formatı tespit edildi');
        this.retryCount = 0; // Reset retry count for new video
        
        // Uzak sunucunun origin'ini al (absolute path'leri çözümlemek için)
        try {
            let remoteUrl = originalUrl;
            if (originalUrl.includes('/proxy/video?url=')) {
                const match = originalUrl.match(/url=([^&]+)/);
                if (match) {
                    remoteUrl = decodeURIComponent(match[1]);
                }
            }
            
            if (remoteUrl.startsWith('http')) {
                const urlObj = new URL(remoteUrl);
                this.lastLoadedOrigin = urlObj.origin;
                this.lastLoadedBaseUrl = remoteUrl.substring(0, remoteUrl.lastIndexOf('/') + 1);
            }
        } catch (e) {
            this.lastLoadedOrigin = null;
            this.lastLoadedBaseUrl = null;
        }

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
                    // Tüm istekleri proxy üzerinden yönlendir
                    xhrSetup: (xhr, requestUrl) => {
                        // 1. Zaten tam proxy URL ise, base URL'i kaydet ve devam et
                        if (requestUrl.includes('/proxy/video?url=')) {
                            const match = requestUrl.match(/url=([^&]+)/);
                            if (match) {
                                try {
                                    const decodedUrl = decodeURIComponent(match[1]);
                                    const proxyBase = getProxyBaseUrl();
                                    let finalRemoteUrl = decodedUrl;
                                    
                                    // Eğer decodedUrl zaten bizim proxy originimizi içeriyorsa (hata durumu), onu temizle
                                    if (decodedUrl.startsWith(proxyBase)) {
                                        const innerMatch = decodedUrl.match(/\/proxy\/video\?url=([^&]+)/);
                                        if (innerMatch) {
                                            finalRemoteUrl = decodeURIComponent(innerMatch[1]);
                                        }
                                    }

                                    if (finalRemoteUrl.startsWith('http')) {
                                        this.lastLoadedBaseUrl = finalRemoteUrl.substring(0, finalRemoteUrl.lastIndexOf('/') + 1);
                                        this.lastLoadedOrigin = new URL(finalRemoteUrl).origin;
                                    }
                                } catch (e) { /* ignore */ }
                            }
                            return;
                        }
                        
                        const proxyOrigin = getProxyBaseUrl();
                        
                        // 2. Browser tarafından yanlış çözümlenmiş mutlak yollar (Manifest'te / ile başlayan path'ler)
                        if (requestUrl.startsWith(proxyOrigin) && !requestUrl.includes('/proxy/')) {
                            const path = requestUrl.substring(proxyOrigin.length);
                            if (this.lastLoadedOrigin) {
                                const correctUrl = this.lastLoadedOrigin.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
                                xhr.open('GET', buildServiceProxyUrl(correctUrl, userAgent, referer, 'video'), true);
                                return;
                            }
                        }
                        
                        // 3. Yanlış çözümlenmiş göreli yollar (Manifest'teki relative path'ler proxy adresine eklenirse)
                        if (requestUrl.includes('/proxy/') && !requestUrl.includes('/proxy/video?url=')) {
                            const parts = requestUrl.split('/proxy/');
                            const relativePath = parts[parts.length - 1]; // segment.ts veya sub/segment.ts

                            if (this.lastLoadedBaseUrl) {
                                const correctUrl = this.lastLoadedBaseUrl.replace(/\/$/, '') + '/' + relativePath.replace(/^\//, '');
                                xhr.open('GET', buildServiceProxyUrl(correctUrl, userAgent, referer, 'video'), true);
                                return;
                            }
                        }
 
                        // 4. Diğer tüm durumlar (Normal URL'ler) -> Proxy'ye sar
                        try {
                            const proxyUrl = buildServiceProxyUrl(requestUrl, userAgent, referer, 'video');
                            
                            // Base URL'i kaydet (eğer http ile başlıyorsa)
                            if (requestUrl.startsWith('http')) {
                                this.lastLoadedBaseUrl = requestUrl.substring(0, requestUrl.lastIndexOf('/') + 1);
                                this.lastLoadedOrigin = new URL(requestUrl).origin;
                            }
                            
                            xhr.open('GET', proxyUrl, true);
                        } catch (error) {
                            console.error('HLS Proxy Error:', error);
                            const fallbackUrl = buildServiceProxyUrl(requestUrl, userAgent, referer, 'video');
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

                // Manifest için proxy URL oluştur (Go/Python fallback destekli)
                const manifestProxyUrl = buildServiceProxyUrl(originalUrl, userAgent, referer, 'video');
                
                this.logger.info('HLS manifest yükleniyor (proxy)', manifestProxyUrl);
                
                // HLS kaynağını yükle (proxy URL - segment URL'leri için xhrSetup devreye girer)
                hls.loadSource(manifestProxyUrl);
                hls.attachMedia(this.videoPlayer);
            } catch (error) {
                this.logger.error('HLS yükleme hatası', error.message);
                this.onVideoError();
            }
        } else if (this.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS desteği var (Safari, iOS)
            this.logger.info('Native HLS desteği kullanılıyor');

            try {
                // Native için proxy URL gerekli (Go/Python fallback destekli)
                const proxyUrl = buildServiceProxyUrl(originalUrl, userAgent, referer, 'video');
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
