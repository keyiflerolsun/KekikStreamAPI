# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

# * Docker İmajı (Builder)
FROM golang:1.23-alpine AS builder

# * Çalışma Alanı
WORKDIR /build
COPY . .

# * Bağımlılıklar
RUN go mod tidy && go mod download

# * Derleme
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o proxy .

# * Çalışma İmajı
FROM alpine:latest

# * Timezone ve sertifikalar
RUN apk add --no-cache ca-certificates tzdata wget && \
    ln -sf /usr/share/zoneinfo/Europe/Istanbul /etc/localtime

ENV TZ="Europe/Istanbul"

WORKDIR /app
COPY --from=builder /build/proxy .

# * Ortam Değişkenleri
ENV PORT=3311 \
    CACHE_SIZE_MB=128 \
    CACHE_TTL_SECONDS=900

# * Sağlık Kontrolü
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

# * Uygulamanın Başlatılması
CMD ["./proxy"]
