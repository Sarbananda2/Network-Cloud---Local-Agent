package token

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const (
	tokenFileName = ".token"
)

// StoredToken holds the token data persisted for the agent.
type StoredToken struct {
	AccessToken string    `json:"access_token"`
	AgentUUID   string    `json:"agent_uuid"`
	ObtainedAt  time.Time `json:"obtained_at"`
}

// Load retrieves the stored token from disk.
func Load() (*StoredToken, error) {
	path, err := tokenPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read token file: %w", err)
	}

	var token StoredToken
	if err := json.Unmarshal(data, &token); err != nil {
		return nil, fmt.Errorf("parse token file: %w", err)
	}

	if token.AccessToken == "" || token.AgentUUID == "" {
		return nil, fmt.Errorf("token file missing required fields")
	}

	return &token, nil
}

// Save writes the token to disk, creating the directory if needed.
func Save(token StoredToken) error {
	if token.AccessToken == "" || token.AgentUUID == "" {
		return fmt.Errorf("token fields are required")
	}

	path, err := tokenPath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create token dir: %w", err)
	}

	payload, err := json.MarshalIndent(token, "", "  ")
	if err != nil {
		return fmt.Errorf("encode token file: %w", err)
	}

	if err := os.WriteFile(path, payload, 0o600); err != nil {
		return fmt.Errorf("write token file: %w", err)
	}

	return nil
}

// Clear removes the token file if it exists.
func Clear() error {
	path, err := tokenPath()
	if err != nil {
		return err
	}

	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove token file: %w", err)
	}

	return nil
}

// Path returns the current token file path.
func Path() (string, error) {
	return tokenPath()
}

func tokenPath() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return "", fmt.Errorf("APPDATA is not set")
	}

	return filepath.Join(appData, "NetworkCloud", tokenFileName), nil
}
