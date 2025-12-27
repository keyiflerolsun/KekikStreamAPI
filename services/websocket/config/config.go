// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

package config

import "os"

type Config struct {
	Port string
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3312"
	}

	return &Config{
		Port: port,
	}
}
