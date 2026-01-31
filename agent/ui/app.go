package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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
	State      string `json:"state"`
	Linked     bool   `json:"linked"`
	AgentUUID  string `json:"agentUuid,omitempty"`
	ObtainedAt string `json:"obtainedAt,omitempty"`
	Message    string `json:"message,omitempty"`
}

type LinkStartResponse struct {
	VerificationURI string `json:"verificationUri"`
	UserCode        string `json:"userCode"`
	ExpiresIn       int    `json:"expiresIn"`
	Interval        int    `json:"interval"`
}

type LinkStatusResponse struct {
	Status  string `json:"status"`
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

type LogsResponse struct {
	Lines []string `json:"lines,omitempty"`
}

type ConfigResponse struct {
	ServerURL           string `json:"serverUrl"`
	SyncIntervalSeconds int    `json:"syncIntervalSeconds"`
}

type NetworkResponse struct {
	Primary  *AdapterInfo  `json:"primary,omitempty"`
	Adapters []AdapterInfo `json:"adapters"`
}

type AdapterInfo struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Type           string   `json:"type"`
	MACAddress     string   `json:"macAddress"`
	Connected      bool     `json:"connected"`
	DHCPEnabled    bool     `json:"dhcpEnabled"`
	IPv4Address    string   `json:"ipv4Address,omitempty"`
	SubnetMask     string   `json:"subnetMask,omitempty"`
	DefaultGateway string   `json:"defaultGateway,omitempty"`
	DHCPServer     string   `json:"dhcpServer,omitempty"`
	DNSServers     []string `json:"dnsServers,omitempty"`
}

const controlBaseURL = "http://127.0.0.1:17880"

func (a *App) GetStatus() (*StatusResponse, error) {
	return doRequest[StatusResponse](http.MethodGet, "/status", nil)
}

func (a *App) GetConfig() (*ConfigResponse, error) {
	return doRequest[ConfigResponse](http.MethodGet, "/config", nil)
}

func (a *App) StartLink() (*LinkStartResponse, error) {
	return doRequest[LinkStartResponse](http.MethodPost, "/link/start", nil)
}

func (a *App) LinkStatus() (*LinkStatusResponse, error) {
	return doRequest[LinkStatusResponse](http.MethodPost, "/link/status", nil)
}

func (a *App) CancelLink() (*LinkStatusResponse, error) {
	return doRequest[LinkStatusResponse](http.MethodPost, "/link/cancel", nil)
}

func (a *App) Unlink() (*LinkStatusResponse, error) {
	return doRequest[LinkStatusResponse](http.MethodPost, "/unlink", nil)
}

func (a *App) StopService() (*LinkStatusResponse, error) {
	return doRequest[LinkStatusResponse](http.MethodPost, "/stop", nil)
}

func (a *App) StartService() (*LinkStatusResponse, error) {
	return doRequest[LinkStatusResponse](http.MethodPost, "/start", nil)
}

func (a *App) TailLogs() (*LogsResponse, error) {
	return doRequest[LogsResponse](http.MethodGet, "/logs/tail", nil)
}

func (a *App) GetNetwork() (*NetworkResponse, error) {
	return doRequest[NetworkResponse](http.MethodGet, "/network", nil)
}

func doRequest[T any](method string, path string, payload interface{}) (*T, error) {
	token, err := loadControlToken()
	if err != nil {
		return nil, err
	}

	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(encoded)
	}

	req, err := http.NewRequest(method, controlBaseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Control-Token", token)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("control api error %d", resp.StatusCode)
	}

	var result T
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

func loadControlToken() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return "", fmt.Errorf("APPDATA is not set")
	}
	path := filepath.Join(appData, "NetworkCloud", ".control_token")
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(bytes.TrimSpace(data)), nil
}
