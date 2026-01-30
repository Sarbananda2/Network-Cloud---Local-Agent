package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	MaxRetries     = 3
	InitialBackoff = 500 * time.Millisecond
	RequestTimeout = 10 * time.Second
)

// Client handles HTTP communication with the NetworkCloud API.
type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

// Device represents the API device payload.
type Device struct {
	Name       string           `json:"name"`
	MACAddress string           `json:"macAddress"`
	Status     string           `json:"status"`
	IPAddress  string           `json:"ipAddress"`
	Adapters   []AdapterPayload `json:"adapters,omitempty"`
}

// AdapterPayload describes a network adapter in sync payloads.
type AdapterPayload struct {
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

// RegisterRequest registers the agent with the API.
type RegisterRequest struct {
	AgentUUID  string `json:"agentUuid"`
	Hostname   string `json:"hostname"`
	MACAddress string `json:"macAddress"`
	IPAddress  string `json:"ipAddress"`
	Timestamp  string `json:"timestamp"`
}

// HeartbeatRequest sends heartbeat data.
type HeartbeatRequest struct {
	AgentUUID  string `json:"agentUuid"`
	Hostname   string `json:"hostname"`
	MACAddress string `json:"macAddress"`
	IPAddress  string `json:"ipAddress"`
	Timestamp  string `json:"timestamp"`
}

// DeviceAuthorizeRequest starts device flow.
type DeviceAuthorizeRequest struct {
	Hostname   string `json:"hostname"`
	MACAddress string `json:"macAddress"`
}

// DeviceAuthorizeResponse represents the device authorization response.
type DeviceAuthorizeResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

// DeviceTokenRequest polls for device flow token.
type DeviceTokenRequest struct {
	DeviceCode string `json:"device_code"`
}

// DeviceTokenResponse represents the device token response.
type DeviceTokenResponse struct {
	AccessToken string `json:"access_token,omitempty"`
	TokenType   string `json:"token_type,omitempty"`
	AgentUUID   string `json:"agent_uuid,omitempty"`
	Error       string `json:"error,omitempty"`
}

// HeartbeatResponse represents the heartbeat response payload.
type HeartbeatResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

// SyncResponse represents the device sync response payload.
type SyncResponse struct {
	Success bool `json:"success"`
	Synced  int  `json:"synced"`
}

// APIError represents a non-2xx API response.
type APIError struct {
	StatusCode int
}

func (e *APIError) Error() string {
	return fmt.Sprintf("api request failed with status %d", e.StatusCode)
}

// NewClient creates a new API client with defaults.
func NewClient(baseURL, token string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		httpClient: &http.Client{
			Timeout: RequestTimeout,
		},
	}
}

// RequestDeviceCode requests a device flow code for user authorization.
func (c *Client) RequestDeviceCode(ctx context.Context, hostname, macAddress string) (*DeviceAuthorizeResponse, error) {
	payload := DeviceAuthorizeRequest{
		Hostname:   hostname,
		MACAddress: macAddress,
	}

	status, body, err := c.doRequestWithStatus(ctx, http.MethodPost, "/api/device/authorize", payload, false)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("device authorize failed with status %d", status)
	}

	var resp DeviceAuthorizeResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode device authorize response: %w", err)
	}

	return &resp, nil
}

// RequestDeviceToken polls for the device flow token.
func (c *Client) RequestDeviceToken(ctx context.Context, deviceCode string) (*DeviceTokenResponse, int, error) {
	payload := DeviceTokenRequest{
		DeviceCode: deviceCode,
	}

	status, body, err := c.doRequestWithStatus(ctx, http.MethodPost, "/api/device/token", payload, false)
	if err != nil {
		return nil, 0, err
	}
	if status != http.StatusOK && status != http.StatusBadRequest {
		return nil, status, fmt.Errorf("device token request failed with status %d", status)
	}

	var resp DeviceTokenResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, status, fmt.Errorf("decode device token response: %w", err)
	}

	return &resp, status, nil
}

// Heartbeat sends a heartbeat request to validate connectivity and token.
func (c *Client) Register(ctx context.Context, request RegisterRequest) error {
	_, err := c.doRequest(ctx, http.MethodPost, "/api/agent/register", request)
	return err
}

// Heartbeat sends a heartbeat request to validate connectivity and token.
func (c *Client) Heartbeat(ctx context.Context, request HeartbeatRequest) (*HeartbeatResponse, error) {
	body, err := c.doRequest(ctx, http.MethodPost, "/api/agent/heartbeat", request)
	if err != nil {
		return nil, err
	}

	var resp HeartbeatResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode heartbeat response: %w", err)
	}

	return &resp, nil
}

// SyncDevices sends the full list of devices to the API for synchronization.
func (c *Client) SyncDevices(ctx context.Context, devices []Device) (*SyncResponse, error) {
	payload := map[string][]Device{
		"devices": devices,
	}

	body, err := c.doRequest(ctx, http.MethodPut, "/api/agent/devices/sync", payload)
	if err != nil {
		return nil, err
	}

	var resp SyncResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode sync response: %w", err)
	}

	return &resp, nil
}

func (c *Client) doRequest(ctx context.Context, method, path string, payload any) ([]byte, error) {
	bodyBytes, err := encodePayload(payload)
	if err != nil {
		return nil, err
	}

	for attempt := 0; attempt < MaxRetries; attempt++ {
		status, respBody, err := c.execute(ctx, method, path, bodyBytes, true)
		if err == nil {
			if status < http.StatusOK || status >= http.StatusMultipleChoices {
				return nil, &APIError{StatusCode: status}
			}
			return respBody, nil
		}

		if attempt == MaxRetries-1 || ctx.Err() != nil {
			return nil, err
		}

		if err := sleepWithContext(ctx, backoffDuration(attempt)); err != nil {
			return nil, err
		}
	}

	return nil, fmt.Errorf("request failed after retries")
}

func (c *Client) doRequestWithStatus(ctx context.Context, method, path string, payload any, useAuth bool) (int, []byte, error) {
	bodyBytes, err := encodePayload(payload)
	if err != nil {
		return 0, nil, err
	}

	return c.execute(ctx, method, path, bodyBytes, useAuth)
}

func (c *Client) execute(ctx context.Context, method, path string, body []byte, useAuth bool) (int, []byte, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return 0, nil, fmt.Errorf("create request: %w", err)
	}

	if useAuth {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, nil, fmt.Errorf("read response: %w", err)
	}

	return resp.StatusCode, respBody, nil
}

func encodePayload(payload any) ([]byte, error) {
	if payload == nil {
		return nil, nil
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}

	return bodyBytes, nil
}

func backoffDuration(attempt int) time.Duration {
	return InitialBackoff * time.Duration(1<<attempt)
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
