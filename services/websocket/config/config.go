// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package config

type Config struct {
	Port string
}

func Load() *Config {
	return &Config{
		Port: "3312", // Sabit port
	}
}
