package control

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
)

const tokenFileName = ".control_token"

// LoadOrCreateToken returns the control token, creating one if missing.
func LoadOrCreateToken() (string, error) {
	path, err := tokenPath()
	if err != nil {
		return "", err
	}

	data, err := os.ReadFile(path)
	if err == nil {
		return string(data), nil
	}
	if !os.IsNotExist(err) {
		return "", fmt.Errorf("read control token: %w", err)
	}

	token, err := generateToken()
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("create control token dir: %w", err)
	}

	if err := os.WriteFile(path, []byte(token), 0o600); err != nil {
		return "", fmt.Errorf("write control token: %w", err)
	}

	return token, nil
}

func tokenPath() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return "", fmt.Errorf("APPDATA is not set")
	}
	return filepath.Join(appData, "NetworkCloud", tokenFileName), nil
}

func generateToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return base64.RawStdEncoding.EncodeToString(bytes), nil
}

