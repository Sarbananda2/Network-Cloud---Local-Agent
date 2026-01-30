package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

type StatusResponse struct {
	State     string `json:"state"`
	Linked    bool   `json:"linked"`
	AgentUUID string `json:"agentUuid,omitempty"`
	ServerURL string `json:"serverUrl"`
	UpdatedAt string `json:"updatedAt"`
}

type LinkStartResponse struct {
	UserCode        string `json:"userCode"`
	VerificationURL string `json:"verificationUrl"`
	ExpiresAt       string `json:"expiresAt"`
}

type LinkStatusResponse struct {
	State     string `json:"state"`
	UserCode  string `json:"userCode,omitempty"`
	ExpiresAt string `json:"expiresAt,omitempty"`
	Error     string `json:"error,omitempty"`
}

// GetStatus retrieves the current agent status via the control API.
func (a *App) GetStatus() (StatusResponse, error) {
	return doRequest[StatusResponse](http.MethodGet, "/status", nil)
}

// StartLink initiates the device link flow.
func (a *App) StartLink() (LinkStartResponse, error) {
	return doRequest[LinkStartResponse](http.MethodPost, "/link/start", nil)
}

// LinkStatus returns the current link status.
func (a *App) LinkStatus() (LinkStatusResponse, error) {
	return doRequest[LinkStatusResponse](http.MethodGet, "/link/status", nil)
}

// Unlink removes the stored token.
func (a *App) Unlink() (map[string]bool, error) {
	return doRequest[map[string]bool](http.MethodPost, "/unlink", nil)
}

func doRequest[T any](method string, path string, payload io.Reader) (T, error) {
	var zero T
	token, err := readControlToken()
	if err != nil {
		return zero, err
	}

	req, err := http.NewRequest(method, "http://127.0.0.1:6161"+path, payload)
	if err != nil {
		return zero, err
	}
	req.Header.Set("X-Control-Token", token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return zero, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return zero, fmt.Errorf("control api error: %s", string(body))
	}

	var out T
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return zero, err
	}

	return out, nil
}

func readControlToken() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return "", fmt.Errorf("APPDATA is not set")
	}
	path := filepath.Join(appData, "NetworkCloud", "control.token")
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
