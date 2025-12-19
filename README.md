# 🎬 KekikStreamAPI

**Modern, Self-Hosted Medya Streaming Platformu**  
Kendi yayın merkezinizi kurun, arkadaşlarınızla senkronize video izleyin! 🚀

---

## 🌟 Genel Bakış

**KekikStreamAPI**, [KekikStream](https://github.com/keyiflerolsun/KekikStream) kütüphanesi üzerine inşa edilmiş tam özellikli bir medya streaming platformudur.

### Temel Özellikler

- 🎥 **Çoklu Kaynak Desteği** - Onlarca kaynaktan içerik arama ve izleme
- 🎭 **Watch Party** - Arkadaşlarınızla gerçek zamanlı senkronize izleme
- 🌐 **Modern Web Arayüzü** - Responsive, kullanıcı dostu arayüz
- 🔌 **RESTful API** - Kolay entegrasyon için API
- 🛡️ **Proxy Streaming** - CORS ve geo-restriction bypass
- 🎬 **yt-dlp** - YouTube ve 1000+ site desteği

---

## 🚀 Hızlı Başlangıç

### Docker ile Kurulum (Önerilen)

```bash
git clone https://github.com/keyiflerolsun/KekikStreamAPI.git
cd KekikStreamAPI
docker-compose up -d
```

👉 Tarayıcınızdan erişin: **http://127.0.0.1:3310**

### Manuel Kurulum

```bash
pip install -r requirements.txt
python basla.py
```

---

## 🏗️ Mimari

```mermaid
graph TB
    Client[🌐 Client]
    
    subgraph KekikStreamAPI[🎬 KekikStreamAPI]
        FastAPI[⚡ FastAPI Core]
        Home[🏠 Web UI]
        API[🔌 API /api/v1]
        WatchParty[🎭 Watch Party]
        WSS[📡 WebSocket]
        Proxy[🛡️ Proxy]
    end
    
    subgraph External[🌍 External Sources]
        KekikStream[📚 KekikStream]
        MediaSources[🎥 Media Sources]
    end
    
    Client -->|HTTP/WS| FastAPI
    FastAPI --> Home
    FastAPI --> API
    FastAPI --> WatchParty
    FastAPI --> WSS
    FastAPI --> Proxy
    
    WatchParty <--> WSS
    API --> KekikStream
    Proxy --> MediaSources
    KekikStream --> MediaSources
    
    style KekikStreamAPI fill:#2b2a29,stroke:#ef7f1a,stroke-width:2px
    style External fill:#0087a3,stroke:#00a0c2,stroke-width:2px
```

---

## ✨ Özellikler

### 🌐 Web Arayüzü

- Ana sayfa, arama, kategori filtreleme
- Sinematik video oynatıcı
- Responsive tasarım (mobil, tablet, desktop)

### 🔌 API Endpoints

| Endpoint | Açıklama |
|----------|----------|
| `/api/v1/health` | API sağlık kontrolü |
| `/api/v1/get_plugin_names` | Tüm eklenti listesi |
| `/api/v1/get_plugin` | Eklenti detayları |
| `/api/v1/search` | İçerik arama |
| `/api/v1/get_main_page` | Kategori içerikleri |
| `/api/v1/load_item` | İçerik detayları |
| `/api/v1/load_links` | Video bağlantıları |
| `/api/v1/extract` | Link extraction |

### 🎭 Watch Party

Gerçek zamanlı senkronize video izleme:

**Kullanım:**
```
http://127.0.0.1:3310/watch-party/{ROOM_ID}?url={VIDEO_URL}
```

**Özellikler:**
- ⚡ WebSocket tabanlı senkronizasyon
- 🔄 Otomatik drift correction
- 🛡️ Akıllı buffer yönetimi
- 💬 Canlı grup sohbeti
- 🎬 YouTube, Vimeo, HLS, MP4 desteği

**Parametreler:**
| Parametre      | Zorunlu   | Açıklama                    |
|---------------:|:---------:|:----------------------------|
| `url`          | ✅        | Video URL'si                |
| `title`        | ❌        | Video başlığı               |
| `user_agent`   | ❌        | Özel User-Agent             |
| `referer`      | ❌        | Özel Referer                |
| `subtitle`     | ❌        | Altyazı URL'si (.srt, .vtt) |

### 🛡️ Proxy Sistemi

- HLS manifest rewriting
- Segment caching (performans)
- CORS bypass
- Custom headers desteği

---

## 📖 API Kullanımı

### Örnek: İçerik Arama

```bash
# Eklenti listesi
curl http://127.0.0.1:3310/api/v1/get_plugin_names

# Arama
curl "http://127.0.0.1:3310/api/v1/search?plugin=Dizilla&query=vikings"

# İçerik detayları
curl "http://127.0.0.1:3310/api/v1/load_item?plugin=Dizilla&encoded_url=..."

# Video bağlantıları
curl "http://127.0.0.1:3310/api/v1/load_links?plugin=Dizilla&encoded_url=..."
```

**Response Formatı:**
```json
{
  "results": [
    {
      "title": "Vikings",
      "url": "...",
      "thumbnail": "...",
      "description": "..."
    }
  ]
}
```

---

## 💻 Teknoloji Stack

**Backend:** FastAPI • Uvicorn • WebSockets • httpx  
**Frontend:** Jinja2 • CSS/JS minification  
**Medya:** yt-dlp • KekikStream  
**Güvenlik:** CORS • HSTS • Security Headers

---

## 🛠️ Geliştirme

### Proje Yapısı

```
KekikStreamAPI/
├── Core/              # FastAPI app
├── Public/
│   ├── Home/          # Web UI
│   ├── API/v1/        # RESTful API
│   ├── WatchParty/    # Watch Party
│   ├── WebSocket/     # WebSocket
│   └── Proxy/         # Proxy
├── Settings/          # Konfigürasyon
└── AYAR.yml           # Ana config
```

### Eklenti Geliştirme

Yeni medya kaynakları eklemek için [KekikStream](https://github.com/keyiflerolsun/KekikStream) repo'suna katkıda bulunun:

```python
from KekikStream.Core import PluginBase, MainPageResult, SearchResult, MovieInfo, SeriesInfo

class MyPlugin(PluginBase):
    name        = "MyPlugin"
    language    = "en"
    main_url    = "https://example.com"
    favicon     = f"https://www.google.com/s2/favicons?domain={main_url}&sz=64"
    description = "MyPlugin description"

    main_page   = {
      f"{main_url}/category/" : "Category Name"
    }

    async def get_main_page(self, page: int, url: str, category: str) -> list[MainPageResult]:
        # Ana sayfa implementasyonu
        return results

    async def search(self, query: str) -> list[SearchResult]:
        # Arama implementasyonu
        return results

    async def load_item(self, url: str) -> MovieInfo | SeriesInfo:
        # İçerik detayları
        return details

    async def load_links(self, url: str) -> list[dict]:
        # Video bağlantıları
        return links
```

---

## 🔒 Güvenlik

- ✅ Security Headers (HSTS, X-Frame-Options, X-Content-Type-Options)
- ✅ Referrer-Policy
- ✅ Server header masking
- ✅ CORS konfigürasyonu

**Production Tavsiyeleri:**
- Nginx reverse proxy kullanın
- SSL/TLS aktifleştirin (Let's Encrypt)
- Rate limiting ekleyin

---

## 📊 Performans

| Metrik               | Değer         |
|----------------------|---------------|
| RAM Kullanımı        | ~100-150MB    |
| Eş Zamanlı Kullanıcı | ~100-200      |
| Watch Party Odası    | ~20-30        |
| API İstekleri        | ~1000 req/sec |

---

## 🤝 Katkıda Bulunma

Projeyi geliştirmek için katkılarınızı bekliyoruz!

- **Eklenti Geliştirme:** [KekikStream](https://github.com/keyiflerolsun/KekikStream) repo'suna PR gönderin
- **Bug Raporu:** GitHub Issues kullanın
- **Feature Request:** Yeni özellik önerileri
- **Dokümantasyon:** README ve kod dokümantasyonu iyileştirmeleri

---

## 🌐 Telif Hakkı ve Lisans

* *Copyright (C) 2024 by* [keyiflerolsun](https://github.com/keyiflerolsun) ❤️️
* [GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007](https://github.com/keyiflerolsun/KekikStream/blob/master/LICENSE) *Koşullarına göre lisanslanmıştır..*


---

<p align="center">
  Bu proje <a href="https://github.com/keyiflerolsun">@keyiflerolsun</a> tarafından <a href="https://t.me/KekikAkademi">@KekikAkademi</a> için geliştirilmiştir.
</p>

<p align="center">
  <sub>⭐ Beğendiyseniz yıldız vermeyi unutmayın!</sub>
</p>
