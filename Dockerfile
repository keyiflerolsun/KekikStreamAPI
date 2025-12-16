# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

# * Docker İmajı
FROM python:3.13.7-slim-trixie

# * Etkileşimsiz apt/locale kurulumu
ENV DEBIAN_FRONTEND=noninteractive

# * Sadece build aşamasında güvenli bir locale kullan (C.UTF-8 hazır gelir)
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

# * Çalışma Alanı
WORKDIR /usr/src/KekikStreamAPI
COPY ./ /usr/src/KekikStreamAPI

# * Locales kurulumu ve TR locale üretimi
RUN apt-get update -y && \
    apt-get install --no-install-recommends -y \
        # git \
        # ffmpeg \
        # opus-tools \
        locales \
        curl \
        tzdata && \
    sed -i 's/^# *tr_TR.UTF-8 UTF-8/tr_TR.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen tr_TR.UTF-8 && \
    update-locale LANG=tr_TR.UTF-8 LC_ALL=tr_TR.UTF-8 LANGUAGE=tr_TR:tr && \
    ln -fs /usr/share/zoneinfo/Europe/Istanbul /etc/localtime && \
    dpkg-reconfigure -f noninteractive tzdata && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# * Standart ortam değişkenleri
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING="UTF-8" \
    LANG="tr_TR.UTF-8" \
    LC_ALL="tr_TR.UTF-8" \
    LANGUAGE="tr_TR:tr" \
    TZ="Europe/Istanbul"

# * Gerekli Paketlerin Yüklenmesi
RUN python3 -m pip install --upgrade pip && \
    python3 -m pip install --no-cache-dir -U setuptools wheel && \
    python3 -m pip install --no-cache-dir -Ur requirements.txt

# * Sağlık Kontrolü
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3310/api/v1/health || exit 1

# * Uygulamanın Başlatılması
CMD ["python3", "basla.py"]
