# NetworkCloud Agent - Go Implementation Specification

**Version:** 1.0  
**Date:** January 2026  
**Status:** Production Ready

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Requirements](#2-system-requirements)
3. [Architecture Overview](#3-architecture-overview)
4. [Agent State Machine](#4-agent-state-machine)
5. [OAuth Device Flow Authentication](#5-oauth-device-flow-authentication)
6. [API Contracts](#6-api-contracts)
7. [Network Adapter Discovery](#7-network-adapter-discovery)
8. [Error Handling & Retry Logic](#8-error-handling--retry-logic)
9. [Configuration](#9-configuration)
10. [Security Considerations](#10-security-considerations)
11. [Logging & Monitoring](#11-logging--monitoring)
12. [Installation & Deployment](#12-installation--deployment)

---

## 1. Executive Summary

### Purpose

The NetworkCloud Agent is a lightweight Go application that runs on local client machines (Windows, macOS, Linux) to:

1. **Authenticate** with the NetworkCloud API using OAuth Device Flow
2. **Register** the device with the cloud dashboard
3. **Sync** network adapter information to the cloud
4. **Maintain** a persistent heartbeat connection for monitoring

### Key Behaviors

- Runs as a background service/daemon
- Automatically starts on system boot
- Self-heals from network interruptions
- Gracefully handles token revocation (device deletion from dashboard)
- Minimal resource footprint

---

## 2. System Requirements

### Supported Platforms

| Platform | Minimum Version | Architecture |
|----------|----------------|--------------|
| Windows  | Windows 10     | x64, ARM64   |
| macOS    | 10.15 Catalina | x64, ARM64   |
| Linux    | Kernel 4.15+   | x64, ARM64   |

### Dependencies

- **Network**: Outbound HTTPS (port 443) to NetworkCloud API
- **Permissions**: 
  - Read network adapter information
  - Write to local config directory
  - (Optional) Run as system service

### Resource Limits

- **Memory**: < 20 MB typical usage
- **CPU**: < 1% during heartbeat cycles
- **Disk**: < 10 MB for binary + config + logs

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    NetworkCloud Agent                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Config     │  │    State     │  │  Network         │   │
│  │   Manager    │  │   Machine    │  │  Discovery       │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Auth       │  │    API       │  │  Token           │   │
│  │   (Device    │  │   Client     │  │  Storage         │   │
│  │    Flow)     │  │              │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  NetworkCloud    │
                    │  API Server      │
                    └──────────────────┘
```

### Core Components

| Component | Responsibility |
|-----------|---------------|
| **Config Manager** | Load/save configuration, handle defaults |
| **State Machine** | Manage agent lifecycle transitions |
| **Network Discovery** | Gather network adapter information from OS |
| **Auth (Device Flow)** | Handle OAuth Device Flow authentication |
| **API Client** | HTTP communication with NetworkCloud API |
| **Token Storage** | Securely persist access tokens |

---

## 4. Agent State Machine

### States

```
┌─────────┐
│  IDLE   │ ◄─────────────────────────────────────┐
└────┬────┘                                        │
     │ Start Device Flow                           │
     ▼                                             │
┌──────────────┐                                   │
│ AWAITING_CODE│ (Display user_code to user)       │
└──────┬───────┘                                   │
       │ User authorizes                           │
       ▼                                           │
┌──────────────┐                                   │
│   POLLING    │ (Poll for token)                  │
└──────┬───────┘                                   │
       │ Token received                            │
       ▼                                           │
┌──────────────┐                                   │
│  AUTHORIZED  │                                   │
└──────┬───────┘                                   │
       │ Registration + Sync successful            │
       ▼                                           │
┌──────────────┐         ┌──────────────┐          │
│   RUNNING    │────────►│ DISCONNECTED │──────────┘
└──────────────┘  401    └──────────────┘
       │                        │
       │ Manual stop            │ User re-links
       ▼                        │
┌──────────────┐                │
│   STOPPED    │◄───────────────┘
└──────────────┘
```

### State Definitions

| State | Description | Actions |
|-------|-------------|---------|
| `IDLE` | Agent initialized, no authentication | Wait for user to initiate device flow |
| `AWAITING_CODE` | Device code obtained | Display `user_code` and `verification_uri` to user |
| `POLLING` | Waiting for user authorization | Poll `/api/device/token` at specified interval |
| `AUTHORIZED` | Token received | Proceed to registration and sync |
| `RUNNING` | Fully operational | Heartbeat loop active, monitoring for changes |
| `DISCONNECTED` | Token revoked (401 received) | Stop all operations, clear token, prompt re-link |
| `STOPPED` | Manually stopped by user | All operations halted |

### Transitions

| From | To | Trigger |
|------|----|---------|
| IDLE | AWAITING_CODE | `startDeviceFlow()` called |
| AWAITING_CODE | POLLING | Device code response received |
| POLLING | AUTHORIZED | Token response received with `access_token` |
| POLLING | IDLE | Token expired or user denied |
| AUTHORIZED | RUNNING | Registration + initial sync successful |
| RUNNING | DISCONNECTED | 401 error on heartbeat or sync |
| RUNNING | STOPPED | `stopAgent()` called |
| DISCONNECTED | IDLE | `relinkDevice()` called |
| STOPPED | RUNNING | `restartAgent()` called (if token valid) |

---

## 5. OAuth Device Flow Authentication

### Overview

The agent uses [RFC 8628 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628) to authenticate without requiring the user to enter credentials on the device.

### Flow Diagram

```
┌──────────┐                              ┌──────────────┐
│  Agent   │                              │ NetworkCloud │
└────┬─────┘                              └──────┬───────┘
     │                                           │
     │  POST /api/device/authorize               │
     │  { hostname, macAddress }                 │
     │ ─────────────────────────────────────────►│
     │                                           │
     │  { device_code, user_code,                │
     │    verification_uri, expires_in,          │
     │    interval }                             │
     │ ◄─────────────────────────────────────────│
     │                                           │
     │  Display to user:                         │
     │  "Go to {verification_uri}                │
     │   Enter code: {user_code}"                │
     │                                           │
     │                                           │
     │  POST /api/device/token                   │
     │  { device_code }                          │
     │ ─────────────────────────────────────────►│
     │                                           │
     │  { error: "authorization_pending" }       │
     │ ◄─────────────────────────────────────────│
     │                                           │
     │  ... (repeat at interval) ...             │
     │                                           │
     │  POST /api/device/token                   │
     │  { device_code }                          │
     │ ─────────────────────────────────────────►│
     │                                           │
     │  { access_token, token_type,              │
     │    agent_uuid }                           │
     │ ◄─────────────────────────────────────────│
     │                                           │
```

### Step 1: Request Device Code

**Endpoint:** `POST /api/device/authorize`

**Request:**
```json
{
  "hostname": "DESKTOP-ABC123",
  "macAddress": "AA:BB:CC:DD:EE:FF"
}
```

**Response (200 OK):**
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://networkcloud.example.com/device",
  "expires_in": 1800,
  "interval": 5
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `device_code` | string | Secret code for polling (do not display) |
| `user_code` | string | Short code user enters on verification page |
| `verification_uri` | string | URL where user enters the code |
| `expires_in` | integer | Seconds until device_code expires |
| `interval` | integer | Minimum seconds between token poll requests |

### Step 2: Display to User

The agent must clearly display:
- The `verification_uri` (e.g., "Visit: https://networkcloud.example.com/device")
- The `user_code` (e.g., "Enter code: WDJB-MJHT")

For CLI agents, print to stdout. For GUI agents, show a dialog.

### Step 3: Poll for Token

**Endpoint:** `POST /api/device/token`

**Request:**
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS"
}
```

**Polling Response (400 - Waiting):**
```json
{
  "error": "authorization_pending"
}
```

**Polling Response (400 - Slow Down):**
```json
{
  "error": "slow_down"
}
```
*On receiving this, increase polling interval by 5 seconds.*

**Success Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Response (400 - Expired):**
```json
{
  "error": "expired_token"
}
```

**Error Response (400 - Denied):**
```json
{
  "error": "access_denied"
}
```

### Polling Logic (Pseudocode)

```go
func pollForToken(deviceCode string, interval int, expiresAt time.Time) (*TokenResponse, error) {
    pollInterval := time.Duration(interval) * time.Second
    
    for time.Now().Before(expiresAt) {
        time.Sleep(pollInterval)
        
        resp, err := requestToken(deviceCode)
        if err != nil {
            return nil, err
        }
        
        switch resp.Error {
        case "":
            // Success - token received
            return resp, nil
        case "authorization_pending":
            // Continue polling
            continue
        case "slow_down":
            // Increase interval
            pollInterval += 5 * time.Second
            continue
        case "expired_token":
            return nil, ErrTokenExpired
        case "access_denied":
            return nil, ErrAccessDenied
        }
    }
    
    return nil, ErrTimeout
}
```

---

## 6. API Contracts

All authenticated endpoints require:
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

### 6.1 Agent Registration

**Endpoint:** `POST /api/agent/register`

**Purpose:** Register this agent instance with the cloud.

**Request:**
```json
{
  "agentUuid": "550e8400-e29b-41d4-a716-446655440000",
  "hostname": "DESKTOP-ABC123",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "ipAddress": "192.168.1.100",
  "timestamp": "2026-01-29T10:30:00.000Z"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Agent registered successfully"
}
```

**Error Responses:**

| Status | Meaning |
|--------|---------|
| 401 | Token invalid or revoked |
| 409 | Agent already registered (may proceed) |
| 500 | Server error |

### 6.2 Device Sync

**Endpoint:** `PUT /api/agent/devices/sync`

**Purpose:** Sync current network adapter information to the cloud.

**Request:**
```json
{
  "devices": [
    {
      "name": "DESKTOP-ABC123",
      "macAddress": "AA:BB:CC:DD:EE:FF",
      "status": "online",
      "ipAddress": "192.168.1.100",
      "adapters": [
        {
          "name": "Ethernet",
          "description": "Intel(R) Ethernet Connection I219-V",
          "type": "Ethernet",
          "macAddress": "AA:BB:CC:DD:EE:FF",
          "connected": true,
          "dhcpEnabled": true,
          "ipv4Address": "192.168.1.100",
          "subnetMask": "255.255.255.0",
          "defaultGateway": "192.168.1.1",
          "dhcpServer": "192.168.1.1",
          "dnsServers": ["8.8.8.8", "8.8.4.4"]
        },
        {
          "name": "Wi-Fi",
          "description": "Intel(R) Wi-Fi 6 AX201 160MHz",
          "type": "Wireless",
          "macAddress": "11:22:33:44:55:66",
          "connected": false,
          "dhcpEnabled": true
        }
      ]
    }
  ]
}
```

**Adapter Object Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Adapter name (e.g., "Ethernet", "Wi-Fi") |
| `description` | string | Yes | Full adapter description |
| `type` | string | Yes | "Ethernet", "Wireless", "Virtual", "Bluetooth", "VPN" |
| `macAddress` | string | Yes | MAC address (format: XX:XX:XX:XX:XX:XX) |
| `connected` | boolean | Yes | Whether adapter has active connection |
| `dhcpEnabled` | boolean | Yes | Whether DHCP is enabled |
| `ipv4Address` | string | No | IPv4 address (only if connected) |
| `subnetMask` | string | No | Subnet mask (only if connected) |
| `defaultGateway` | string | No | Default gateway (only if connected) |
| `dhcpServer` | string | No | DHCP server address (only if DHCP enabled) |
| `dnsServers` | string[] | No | DNS server addresses |

**Success Response (200 OK):**
```json
{
  "success": true,
  "synced": 1
}
```

**Error Responses:**

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Token revoked | Enter DISCONNECTED state |
| 400 | Invalid payload | Log error, retry with corrected data |
| 500 | Server error | Retry with backoff |

### 6.3 Heartbeat

**Endpoint:** `POST /api/agent/heartbeat`

**Purpose:** Maintain connection and report agent status.

**Request:**
```json
{
  "agentUuid": "550e8400-e29b-41d4-a716-446655440000",
  "hostname": "DESKTOP-ABC123",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "ipAddress": "192.168.1.100",
  "timestamp": "2026-01-29T10:30:00.000Z"
}
```

**Success Response (200 OK):**
```json
{
  "status": "ok",
  "message": "Heartbeat received"
}
```

**Response Status Values:**

| Status | Meaning | Action |
|--------|---------|--------|
| `ok` | All good | Continue normal operation |
| `pending_approval` | Device awaiting admin approval | Show notification, continue heartbeats |
| `device_mismatch` | MAC/hostname changed | Re-sync device info |

**Error Responses:**

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Token revoked (device deleted) | Enter DISCONNECTED state immediately |
| 500 | Server error | Retry with backoff |

### 6.4 Request Timeout

All API requests should have a **10 second timeout**.

---

## 7. Network Adapter Discovery

The agent must gather real network adapter information from the operating system.

### Windows

Use `ipconfig /all` or WMI queries:

```go
// Option 1: Parse ipconfig /all output
cmd := exec.Command("ipconfig", "/all")
output, _ := cmd.Output()
// Parse output for adapter info

// Option 2: Use Go's net package + Windows-specific calls
interfaces, _ := net.Interfaces()
for _, iface := range interfaces {
    addrs, _ := iface.Addrs()
    // iface.Name, iface.HardwareAddr, addrs...
}
```

**Windows IP Configuration Fields to Extract:**
- Host Name
- Physical Address (MAC)
- DHCP Enabled
- IPv4 Address
- Subnet Mask
- Default Gateway
- DHCP Server
- DNS Servers

### macOS

```go
// Use system_profiler or networksetup
cmd := exec.Command("networksetup", "-listallhardwareports")
// Or use Go's net package
interfaces, _ := net.Interfaces()
```

### Linux

```go
// Use /sys/class/net or Go's net package
interfaces, _ := net.Interfaces()
for _, iface := range interfaces {
    // Read from /sys/class/net/{iface.Name}/ for additional details
}

// Or parse 'ip addr' output
cmd := exec.Command("ip", "addr")
```

### Go net Package (Cross-Platform)

```go
import "net"

func discoverAdapters() ([]Adapter, error) {
    interfaces, err := net.Interfaces()
    if err != nil {
        return nil, err
    }
    
    var adapters []Adapter
    for _, iface := range interfaces {
        // Skip loopback
        if iface.Flags&net.FlagLoopback != 0 {
            continue
        }
        
        adapter := Adapter{
            Name:       iface.Name,
            MACAddress: iface.HardwareAddr.String(),
            Connected:  iface.Flags&net.FlagUp != 0,
        }
        
        addrs, _ := iface.Addrs()
        for _, addr := range addrs {
            if ipnet, ok := addr.(*net.IPNet); ok {
                if ip4 := ipnet.IP.To4(); ip4 != nil {
                    adapter.IPv4Address = ip4.String()
                    adapter.SubnetMask = net.IP(ipnet.Mask).String()
                }
            }
        }
        
        adapters = append(adapters, adapter)
    }
    
    return adapters, nil
}
```

### Primary Adapter Selection

The agent should identify one "primary" adapter for `macAddress` and `ipAddress` fields:

1. Prefer Ethernet over Wi-Fi
2. Prefer connected adapters
3. Prefer adapters with a default gateway
4. Exclude virtual/loopback/VPN adapters for primary selection

---

## 8. Error Handling & Retry Logic

### 8.1 Token Revocation (401 Handling)

When any API call returns **HTTP 401**:

```go
func handleAPIError(resp *http.Response, err error) {
    if resp != nil && resp.StatusCode == 401 {
        // Immediately enter disconnected state
        agent.stopHeartbeat()
        agent.clearToken()
        agent.setState(DISCONNECTED)
        
        log.Warn("Device disconnected - access token revoked")
        notifyUser("Device was removed from dashboard. Re-link required.")
        return
    }
    // Handle other errors...
}
```

### 8.2 Network Errors

For transient network failures, use exponential backoff:

```go
type BackoffConfig struct {
    InitialDelay time.Duration  // 1 second
    MaxDelay     time.Duration  // 5 minutes
    Multiplier   float64        // 2.0
    MaxRetries   int            // 10 (0 = infinite)
}

func retryWithBackoff(operation func() error, config BackoffConfig) error {
    delay := config.InitialDelay
    retries := 0
    
    for {
        err := operation()
        if err == nil {
            return nil
        }
        
        retries++
        if config.MaxRetries > 0 && retries >= config.MaxRetries {
            return fmt.Errorf("max retries exceeded: %w", err)
        }
        
        log.Warnf("Operation failed, retrying in %v: %v", delay, err)
        time.Sleep(delay)
        
        delay = time.Duration(float64(delay) * config.Multiplier)
        if delay > config.MaxDelay {
            delay = config.MaxDelay
        }
    }
}
```

### 8.3 Error Classification

| Error Type | Detection | Recovery |
|------------|-----------|----------|
| **Auth Error** | HTTP 401, 403 | Stop operations, clear token, prompt re-link |
| **Server Error** | HTTP 5xx | Retry with exponential backoff |
| **Client Error** | HTTP 4xx (not 401/403) | Log error, may require config fix |
| **Network Error** | Connection refused, DNS failure, timeout | Retry with backoff |
| **Timeout** | Request exceeds 10s | Retry immediately, then with backoff |

### 8.4 Network Change Detection

Monitor for network changes and trigger re-sync:

```go
// Periodic check (every 60 seconds)
func monitorNetworkChanges() {
    ticker := time.NewTicker(60 * time.Second)
    lastHash := hashAdapters(discoverAdapters())
    
    for range ticker.C {
        adapters := discoverAdapters()
        currentHash := hashAdapters(adapters)
        
        if currentHash != lastHash {
            log.Info("Network change detected, syncing...")
            syncDevices(adapters)
            lastHash = currentHash
        }
    }
}
```

---

## 9. Configuration

### 9.1 Configuration File

**Location:**
- Windows: `%APPDATA%\NetworkCloud\agent.yaml`
- macOS: `~/Library/Application Support/NetworkCloud/agent.yaml`
- Linux: `~/.config/networkcloud/agent.yaml`

**Format:**
```yaml
# NetworkCloud Agent Configuration

# Server URL (required)
server_url: "https://api.networkcloud.example.com"

# Heartbeat interval in seconds (default: 30)
heartbeat_interval: 30

# Device sync interval in seconds (default: 300)
sync_interval: 300

# Network change check interval in seconds (default: 60)
network_check_interval: 60

# Log level: debug, info, warn, error (default: info)
log_level: info

# Log file path (optional, defaults to stdout)
log_file: ""

# Enable auto-start on system boot (default: true)
auto_start: true
```

### 9.2 Token Storage

Tokens should be stored separately and securely:

**Location:**
- Windows: `%APPDATA%\NetworkCloud\.token`
- macOS: Keychain (preferred) or `~/Library/Application Support/NetworkCloud/.token`
- Linux: Secret Service (preferred) or `~/.config/networkcloud/.token`

**Token File Format:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "obtained_at": "2026-01-29T10:30:00Z"
}
```

### 9.3 Command Line Flags

```
networkcloud-agent [flags]

Flags:
  --config string      Path to config file (default: auto-detect)
  --server-url string  NetworkCloud server URL (overrides config)
  --link               Start device linking flow
  --unlink             Remove device authorization
  --status             Show current agent status
  --version            Show version information
  -h, --help           Show help
```

---

## 10. Security Considerations

### 10.1 Token Protection

1. **Never log tokens** - Redact in all log output
2. **Secure storage** - Use OS keychain/credential manager where available
3. **Memory protection** - Clear token from memory when entering DISCONNECTED state
4. **File permissions** - Token file should be readable only by owner (0600)

### 10.2 Communication Security

1. **TLS only** - Reject plain HTTP connections to API
2. **Certificate validation** - Verify server certificates (no `InsecureSkipVerify`)
3. **Timeout protection** - 10 second timeouts prevent hanging connections

### 10.3 Input Validation

1. **URL validation** - Validate `server_url` is well-formed HTTPS URL
2. **Response validation** - Validate all API responses before processing
3. **Size limits** - Limit response body sizes to prevent memory exhaustion

### 10.4 Minimal Permissions

The agent should request only necessary permissions:
- Read network adapter information
- Write to config directory
- Outbound HTTPS connections
- (Service mode) Run at startup

---

## 11. Logging & Monitoring

### 11.1 Log Levels

| Level | Use For |
|-------|---------|
| `DEBUG` | Detailed flow tracing, request/response bodies (redacted) |
| `INFO` | State changes, successful operations |
| `WARN` | Recoverable errors, retries, network changes |
| `ERROR` | Unrecoverable errors, disconnection events |

### 11.2 Key Log Events

```go
// State changes
log.Info("Agent state changed", "from", oldState, "to", newState)

// Device flow
log.Info("Device flow started")
log.Info("Awaiting user authorization", "code", userCode, "url", verificationUri)
log.Info("Device authorized successfully")

// Operations
log.Info("Agent registered")
log.Info("Device sync completed", "adapters", len(adapters))
log.Debug("Heartbeat sent", "count", heartbeatCount)

// Errors
log.Warn("Heartbeat failed, retrying", "error", err, "retry_in", delay)
log.Error("Token revoked - device disconnected")
log.Error("Max retries exceeded", "operation", "heartbeat")
```

### 11.3 Metrics (Optional)

If metrics collection is enabled:

| Metric | Type | Description |
|--------|------|-------------|
| `agent_heartbeat_total` | Counter | Total heartbeats sent |
| `agent_heartbeat_errors` | Counter | Failed heartbeats |
| `agent_sync_total` | Counter | Total device syncs |
| `agent_uptime_seconds` | Gauge | Time since agent started |
| `agent_state` | Gauge | Current state (encoded as int) |

---

## 12. Installation & Deployment

### 12.1 Build Targets

```makefile
# Cross-compilation targets
PLATFORMS := windows/amd64 windows/arm64 darwin/amd64 darwin/arm64 linux/amd64 linux/arm64

build-all:
	@for platform in $(PLATFORMS); do \
		GOOS=$${platform%/*} GOARCH=$${platform#*/} \
		go build -o bin/networkcloud-agent-$${platform%/*}-$${platform#*/} ./cmd/agent; \
	done
```

### 12.2 Installation Scripts

**Windows (PowerShell):**
```powershell
# Download and install
Invoke-WebRequest -Uri "https://releases.networkcloud.example.com/agent/latest/windows-amd64.exe" -OutFile "$env:TEMP\networkcloud-agent.exe"
Move-Item "$env:TEMP\networkcloud-agent.exe" "$env:ProgramFiles\NetworkCloud\agent.exe"

# Create service (optional)
New-Service -Name "NetworkCloudAgent" -BinaryPathName "$env:ProgramFiles\NetworkCloud\agent.exe" -StartupType Automatic
```

**macOS/Linux:**
```bash
# Download and install
curl -L "https://releases.networkcloud.example.com/agent/latest/$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)" -o /tmp/networkcloud-agent
chmod +x /tmp/networkcloud-agent
sudo mv /tmp/networkcloud-agent /usr/local/bin/

# Create systemd service (Linux)
sudo tee /etc/systemd/system/networkcloud-agent.service << EOF
[Unit]
Description=NetworkCloud Agent
After=network-online.target

[Service]
ExecStart=/usr/local/bin/networkcloud-agent
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable networkcloud-agent
sudo systemctl start networkcloud-agent
```

### 12.3 First-Time Setup

1. User runs `networkcloud-agent --link`
2. Agent displays device code and URL
3. User visits URL, enters code, approves device
4. Agent receives token, registers, syncs, starts heartbeat
5. Agent runs continuously in background

### 12.4 Uninstallation

```bash
# Stop and remove service
sudo systemctl stop networkcloud-agent
sudo systemctl disable networkcloud-agent
sudo rm /etc/systemd/system/networkcloud-agent.service

# Remove binary and config
sudo rm /usr/local/bin/networkcloud-agent
rm -rf ~/.config/networkcloud
```

---

## Appendix A: Complete Data Types (Go)

```go
package agent

import "time"

// Configuration
type Config struct {
    ServerURL             string        `yaml:"server_url"`
    HeartbeatInterval     time.Duration `yaml:"heartbeat_interval"`
    SyncInterval          time.Duration `yaml:"sync_interval"`
    NetworkCheckInterval  time.Duration `yaml:"network_check_interval"`
    LogLevel              string        `yaml:"log_level"`
    LogFile               string        `yaml:"log_file"`
    AutoStart             bool          `yaml:"auto_start"`
}

// State
type AgentState string

const (
    StateIdle         AgentState = "idle"
    StateAwaitingCode AgentState = "awaiting_code"
    StatePolling      AgentState = "polling"
    StateAuthorized   AgentState = "authorized"
    StateRunning      AgentState = "running"
    StateDisconnected AgentState = "disconnected"
    StateStopped      AgentState = "stopped"
)

// Device Flow
type DeviceAuthorizeRequest struct {
    Hostname   string `json:"hostname"`
    MACAddress string `json:"macAddress"`
}

type DeviceAuthorizeResponse struct {
    DeviceCode      string `json:"device_code"`
    UserCode        string `json:"user_code"`
    VerificationURI string `json:"verification_uri"`
    ExpiresIn       int    `json:"expires_in"`
    Interval        int    `json:"interval"`
}

type DeviceTokenRequest struct {
    DeviceCode string `json:"device_code"`
}

type DeviceTokenResponse struct {
    AccessToken string `json:"access_token,omitempty"`
    TokenType   string `json:"token_type,omitempty"`
    AgentUUID   string `json:"agent_uuid,omitempty"`
    Error       string `json:"error,omitempty"`
}

// Agent Operations
type RegisterRequest struct {
    AgentUUID  string `json:"agentUuid"`
    Hostname   string `json:"hostname"`
    MACAddress string `json:"macAddress"`
    IPAddress  string `json:"ipAddress"`
    Timestamp  string `json:"timestamp"`
}

type HeartbeatRequest struct {
    AgentUUID  string `json:"agentUuid"`
    Hostname   string `json:"hostname"`
    MACAddress string `json:"macAddress"`
    IPAddress  string `json:"ipAddress"`
    Timestamp  string `json:"timestamp"`
}

type HeartbeatResponse struct {
    Status  string `json:"status"`
    Message string `json:"message,omitempty"`
}

// Device Sync
type DeviceSyncRequest struct {
    Devices []Device `json:"devices"`
}

type Device struct {
    Name       string    `json:"name"`
    MACAddress string    `json:"macAddress"`
    Status     string    `json:"status"`
    IPAddress  string    `json:"ipAddress"`
    Adapters   []Adapter `json:"adapters,omitempty"`
}

type Adapter struct {
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

// Token Storage
type StoredToken struct {
    AccessToken string    `json:"access_token"`
    AgentUUID   string    `json:"agent_uuid"`
    ObtainedAt  time.Time `json:"obtained_at"`
}
```

---

## Appendix B: Quick Reference

### API Endpoints Summary

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/device/authorize` | No | Start device flow |
| POST | `/api/device/token` | No | Poll for token |
| POST | `/api/agent/register` | Bearer | Register agent |
| PUT | `/api/agent/devices/sync` | Bearer | Sync device info |
| POST | `/api/agent/heartbeat` | Bearer | Send heartbeat |

### Default Intervals

| Operation | Default | Configurable |
|-----------|---------|--------------|
| Device Flow Polling | Server-specified | No |
| Heartbeat | 30 seconds | Yes |
| Device Sync | 300 seconds | Yes |
| Network Change Check | 60 seconds | Yes |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean shutdown |
| 1 | Configuration error |
| 2 | Network/connection error |
| 3 | Authentication error |

---

*End of Specification*
