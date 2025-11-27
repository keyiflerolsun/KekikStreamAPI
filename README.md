# KekikStreamAPI

**KekikStreamAPI**, [KekikStream](https://github.com/keyiflerolsun/KekikStream) kütüphanesi üzerine inşa edilmiş, **self-hosted** (kendi sunucunuzda barındırabileceğiniz) modern bir web arayüzü ve RESTful API servisidir.

Kendi yayın merkezinizi kurmak hiç bu kadar kolay olmamıştı! 🚀

## 🌟 Özellikler

-   🐳 **Docker ile Kolay Kurulum**: Tek komutla saniyeler içinde ayağa kaldırın.
-   🌐 **Modern Web Arayüzü**:
    -   **Ana Sayfa**: Popüler içerikleri keşfedin.
    -   **Gelişmiş Arama**: İstediğiniz içeriği hızla bulun.
    -   **Kategori Yönetimi**: İçerikleri kategorilere göre filtreleyin.
    -   **Sinematik Oynatıcı**: Dahili oynatıcı ile kesintisiz izleme keyfi.
-   🛡️ **Proxy Streaming**: Dahili proxy sistemi sayesinde coğrafi kısıtlamaları ve CORS sorunlarını aşın.
-   🔌 **Geniş Eklenti Desteği**: `KekikStream` altyapısı ile onlarca kaynaktan içerik çekebilme.
-   🚀 **Yüksek Performans**: Python (FastAPI) ve asenkron mimari ile ışık hızında yanıtlar.

## 🛠️ Kurulum

### 🐳 Docker ile Kurulum (Önerilen)

Bilgisayarınızda veya sunucunuzda Docker ve Docker Compose yüklü ise, kurulum en kolay bu şekilde yapılır.

1.  Projeyi klonlayın:
    ```bash
    git clone https://github.com/keyiflerolsun/KekikStreamAPI.git
    cd KekikStreamAPI
    ```

2.  Konteyneri başlatın:
    ```bash
    docker-compose up -d
    ```

3.  Tarayıcınızdan erişin:
    > http://127.0.0.1:3310

### 🐍 Manuel Kurulum

Geliştirme yapmak veya Docker kullanmadan çalıştırmak isterseniz:

**Gereksinimler:** Python 3.13+

1.  Gerekli paketleri yükleyin:
    ```bash
    pip install -r requirements.txt
    ```

2.  Uygulamayı başlatın:
    ```bash
    python basla.py
    ```
    *Uygulama otomatik olarak assetleri (CSS/JS) minify edip paketleyecektir.*

## 🔒 Güvenlik

KekikStreamAPI, modern güvenlik standartlarına uygun olarak geliştirilmiştir:
-   **Güvenlik Başlıkları**: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy gibi başlıklar otomatik eklenir.
-   **CSRF Koruması**: Form gönderimleri için CSRF token koruması mevcuttur.
-   **Gizlilik**: Gereksiz sunucu bilgileri (Server, X-Powered-By) gizlenir.

## 📖 Kullanım

### Web Arayüzü
Tarayıcınızdan **http://127.0.0.1:3310** adresine giderek modern web arayüzünü kullanmaya başlayabilirsiniz.

### Temel API Endpointleri

| Endpoint            | Method | Parametreler                                                                                                       | Açıklama                                                                        | Örnek Kullanım                                                                                    |
|---------------------|--------|------------------------------------------------------------------------------------------------------------------- |---------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| `/health`           | GET    | -                                                                                                                  | API sağlık durumunu kontrol eder.                                               | `/health`                                                                                         |
| `/get_plugin_names` | GET    | -                                                                                                                  | Tüm eklenti isimlerini getirir.                                                 | `/get_plugin_names`                                                                               |
| `/get_plugin`       | GET    | `plugin`: Eklenti adı                                                                                              | Eklenti bilgilerini getirir (ana URL, favicon, açıklama, kategoriler).          | `/get_plugin?plugin=Dizilla`                                                                      |
| `/search`           | GET    | `plugin`: Eklenti adı<br>`query`: Arama sorgusu                                                                    | Belirtilen eklenti içinde arama yapar ve sonuçları döner.                       | `/search?plugin=Dizilla&query=film`                                                               |
| `/get_main_page`    | GET    | `plugin`: Eklenti adı<br>`page`: Sayfa numarası<br>`encoded_url`: Kategori URL<br>`encoded_category`: Kategori adı | Belirtilen kategori için ana sayfa içerik listesini döner.                      | `/get_main_page?plugin=Dizilla&page=1&encoded_url=<kategori_url>&encoded_category=<kategori_adı>` |
| `/load_item`        | GET    | `plugin`: Eklenti adı<br>`encoded_url`: İçerik URL'si                                                              | Seçilen içeriğin detay bilgilerini getirir.                                     | `/load_item?plugin=Dizilla&encoded_url=<icerik_url>`                                              |
| `/load_links`       | GET    | `plugin`: Eklenti adı<br>`encoded_url`: İçerik ya da bölüm URL'si                                                  | İçeriğe ait yayın/bağlantı listesini döner.                                     | `/load_links?plugin=Dizilla&encoded_url=<icerik_url>`                                             |
| `/extract`          | GET    | `encoded_url`: Bağlantı<br>`encoded_referer`: Referer URL (genellikle eklentinin ana URL'si)                       | Verilen bağlantıdan oynatılabilir linki ekstrakte eder (gerekliyse).            | `/extract?encoded_url=<link>&encoded_referer=<ana_url>`                                           |

## 🤝 Katkıda Bulunma

Eklenti geliştirmeye destek olmak veya yeni özellikler eklemek isterseniz, [KekikStream](https://github.com/keyiflerolsun/KekikStream) kütüphanesine **Pull Request** göndermekten çekinmeyin!

Topluluk katkılarıyla projemizi daha da ileriye taşıyabiliriz. 🚀

---

<p align="center">
  Bu proje <a href="https://github.com/keyiflerolsun">@keyiflerolsun</a> tarafından <a href="https://t.me/KekikAkademi">@KekikAkademi</a> için geliştirilmiştir.
</p>