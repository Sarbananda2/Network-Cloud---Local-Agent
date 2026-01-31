# NetworkCloud Agent API Documentation

This document describes the API endpoints available for the NetworkCloud local agent to communicate with the web application.

## Base URL

Production: `https://networkcloud.tech`
Development: Your Replit dev URL

## Authentication

All agent API endpoints require Bearer token authentication.

### Getting an API Token

1. Log in to the NetworkCloud dashboard
2. Navigate to **Agent Tokens** in the navigation header
3. Click **Create Token**
4. Enter a descriptive name (e.g., "Home Network Agent")
5. Copy the token immediately - it will only be shown once

### Using the Token

Include the token in the `Authorization` header of every request:

```
Authorization: Bearer nc_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

### Token Security

- Tokens are hashed with SHA-256 before storage
- The plain token is shown only once at creation
- Revoked tokens are immediately invalidated
- Store tokens securely in your agent's configuration

---

## API Endpoints

### Heartbeat

Health check endpoint to verify connectivity, register the agent device, and check approval status.

**Request:**
```
POST /api/agent/heartbeat
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentUuid": "550e8400-e29b-41d4-a716-446655440000",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "hostname": "DESKTOP-HOME",
  "ipAddress": "192.168.1.50"
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| agentUuid | string | Yes | Unique identifier for the agent (UUID v4), generated on first install and persisted |
| macAddress | string | Yes | MAC address of the machine running the agent, format `XX:XX:XX:XX:XX:XX` |
| hostname | string | Yes | Hostname of the machine running the agent |
| ipAddress | string | No | IP address of the machine running the agent |

**Response (200 OK) - Approved:**
```json
{
  "status": "ok",
  "serverTime": "2024-01-19T12:00:00.000Z"
}
```

**Response (200 OK) - Pending Approval:**
```json
{
  "status": "pending_approval",
  "serverTime": "2024-01-19T12:00:00.000Z",
  "message": "Waiting for approval from dashboard user."
}
```
When the agent receives this status, it should continue sending heartbeats but NOT sync devices yet. The user must approve the agent in the web dashboard first.

**Response (200 OK) - Pending Reauthorization:**
```json
{
  "status": "pending_reauthorization",
  "serverTime": "2024-01-19T12:00:00.000Z",
  "message": "A different agent is requesting to use this token. Waiting for user to approve replacement."
}
```
This occurs when a different agent UUID is detected for an already-connected token. The new agent's info is stored as a "pending replacement" and the user must decide in the dashboard whether to:
- **Approve Replacement**: Replace the current agent with the new one
- **Keep Current**: Reject the pending agent and keep the current one

This workflow allows legitimate token transfers (e.g., moving agent to new machine) while alerting users to potential security concerns.

**Status Values:**

| Status | Meaning | Agent Action |
|--------|---------|--------------|
| `ok` | Approved and connected | Proceed with device sync |
| `pending_approval` | First connection, awaiting user approval | Keep heartbeating, don't sync |
| `pending_reauthorization` | Different agent trying to use token, awaiting user decision | Keep heartbeating, don't sync |

**Errors:**
- `400 Bad Request` - Missing or invalid agentUuid/macAddress/hostname
- `401 Unauthorized` - Invalid or revoked token

---

### Register Device

Register a new device or update an existing one (matched by MAC address).

**Request:**
```
POST /api/agent/devices
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Living Room PC",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "status": "online",
  "ipAddress": "192.168.1.100"
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Device display name (min 1 character) |
| macAddress | string | No | MAC address in format `XX:XX:XX:XX:XX:XX` |
| status | string | No | One of: `online`, `offline`, `away`. Default: `online` |
| ipAddress | string | No | Valid IPv4 or IPv6 address (primary IP) |
| adapters | array | No | Full network adapter data (see [Network Adapters Schema](#network-adapters-schema)) |

**Response (201 Created):** New device
```json
{
  "id": 1,
  "userId": "user-123",
  "name": "Living Room PC",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "status": "online",
  "lastSeenAt": "2024-01-19T12:00:00.000Z",
  "createdAt": "2024-01-19T12:00:00.000Z"
}
```

**Response (200 OK):** Existing device updated (MAC match)
```json
{
  "id": 1,
  "userId": "user-123",
  "name": "Living Room PC",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "status": "online",
  "lastSeenAt": "2024-01-19T12:05:00.000Z",
  "createdAt": "2024-01-19T12:00:00.000Z"
}
```

**Errors:**
- `400 Bad Request` - Validation error (invalid MAC format, missing name, etc.)
- `401 Unauthorized` - Invalid token

---

### Update Device

Update an existing device by ID.

**Request:**
```
PATCH /api/agent/devices/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "status": "offline",
  "ipAddress": "192.168.1.101"
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | No | New device name |
| status | string | No | One of: `online`, `offline`, `away` |
| ipAddress | string | No | New IP address |

**Response (200 OK):**
```json
{
  "id": 1,
  "userId": "user-123",
  "name": "Updated Name",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "status": "offline",
  "lastSeenAt": "2024-01-19T12:10:00.000Z",
  "createdAt": "2024-01-19T12:00:00.000Z"
}
```

**Errors:**
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Invalid token
- `404 Not Found` - Device not found or belongs to another user

---

### Delete Device

Remove a device from the registry.

**Request:**
```
DELETE /api/agent/devices/:id
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "message": "Device deleted successfully"
}
```

**Errors:**
- `400 Bad Request` - Invalid device ID
- `401 Unauthorized` - Invalid token
- `404 Not Found` - Device not found or belongs to another user

---

### Sync Devices (Bulk Operation)

Synchronize all devices in a single request. This will:
1. Create new devices that don't exist (by MAC address)
2. Update existing devices that match by MAC address
3. Delete devices that exist in the database but are not in the request

**Request:**
```
PUT /api/agent/devices/sync
Authorization: Bearer <token>
Content-Type: application/json

{
  "devices": [
    {
      "name": "Living Room PC",
      "macAddress": "AA:BB:CC:DD:EE:FF",
      "status": "online",
      "ipAddress": "192.168.1.100"
    },
    {
      "name": "Kitchen Tablet",
      "macAddress": "11:22:33:44:55:66",
      "status": "online",
      "ipAddress": "192.168.1.101"
    }
  ]
}
```

**Device Object Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Device display name |
| macAddress | string | No | MAC address for matching |
| status | string | Yes | One of: `online`, `offline`, `away` |
| ipAddress | string | No | Device IP address (primary IP) |
| adapters | array | No | Full network adapter data (see [Network Adapters Schema](#network-adapters-schema)) |

**Response (200 OK):**
```json
{
  "created": 1,
  "updated": 1,
  "deleted": 0
}
```

**Errors:**
- `400 Bad Request` - Validation error in any device
- `401 Unauthorized` - Invalid token

---

## Validation Rules

### MAC Address Format
Must match pattern: `XX:XX:XX:XX:XX:XX` where X is a hexadecimal character (0-9, A-F, a-f)

Valid examples:
- `AA:BB:CC:DD:EE:FF`
- `00:1a:2b:3c:4d:5e`

### IP Address Format
Must be a valid IPv4 or IPv6 address.

Valid examples:
- `192.168.1.100`
- `10.0.0.1`
- `2001:0db8:85a3:0000:0000:8a2e:0370:7334`

### Status Values
Must be one of:
- `online` - Device is currently reachable
- `offline` - Device is not reachable
- `away` - Device was recently active but currently unreachable

---

## Network Adapters Schema

The `adapters` field allows the agent to send detailed network adapter information similar to what `ipconfig /all` provides on Windows.

### Adapter Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Adapter name (e.g., "Ethernet", "Wi-Fi", "Hyper-V Virtual Ethernet Adapter") |
| type | string | Yes | Adapter type: `ethernet`, `wifi`, `virtual`, `vpn`, `loopback`, or `other` |
| macAddress | string | No | Physical/MAC address |
| ipv4 | string | No | IPv4 address |
| ipv6 | string | No | IPv6 address |
| gateway | string | No | Default gateway address |
| subnetMask | string | No | Subnet mask (e.g., "255.255.255.0") |
| dns | array | No | Array of DNS server addresses |
| dhcpEnabled | boolean | No | Whether DHCP is enabled |
| dhcpServer | string | No | DHCP server address |
| connected | boolean | No | Whether the adapter has media connected (default: true) |

### Example Request with Adapters

```json
{
  "name": "Home Desktop",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "status": "online",
  "ipAddress": "192.168.1.100",
  "adapters": [
    {
      "name": "Ethernet",
      "type": "ethernet",
      "macAddress": "AA:BB:CC:DD:EE:FF",
      "ipv4": "192.168.1.100",
      "ipv6": "fe80::1234:5678:abcd:ef00",
      "gateway": "192.168.1.1",
      "subnetMask": "255.255.255.0",
      "dns": ["8.8.8.8", "8.8.4.4"],
      "dhcpEnabled": true,
      "dhcpServer": "192.168.1.1",
      "connected": true
    },
    {
      "name": "Wi-Fi",
      "type": "wifi",
      "macAddress": "11:22:33:44:55:66",
      "connected": false
    },
    {
      "name": "Hyper-V Virtual Ethernet Adapter",
      "type": "virtual",
      "ipv4": "172.17.0.1",
      "subnetMask": "255.255.0.0",
      "connected": true
    }
  ]
}
```

### Adapter Type Mapping

When parsing `ipconfig /all` output, map adapter descriptions to types:

| Windows Adapter Description Contains | Type |
|--------------------------------------|------|
| "Ethernet", "Realtek", "Intel(R) Ethernet" | `ethernet` |
| "Wi-Fi", "Wireless", "802.11" | `wifi` |
| "Hyper-V", "VirtualBox", "VMware", "Docker" | `virtual` |
| "VPN", "TAP", "TUN", "WireGuard" | `vpn` |
| "Loopback" | `loopback` |
| Other | `other` |

### Go Code Example

```go
type NetworkAdapter struct {
    Name        string   `json:"name"`
    Type        string   `json:"type"`
    MacAddress  string   `json:"macAddress,omitempty"`
    IPv4        string   `json:"ipv4,omitempty"`
    IPv6        string   `json:"ipv6,omitempty"`
    Gateway     string   `json:"gateway,omitempty"`
    SubnetMask  string   `json:"subnetMask,omitempty"`
    DNS         []string `json:"dns,omitempty"`
    DHCPEnabled *bool    `json:"dhcpEnabled,omitempty"`
    DHCPServer  string   `json:"dhcpServer,omitempty"`
    Connected   bool     `json:"connected"`
}

// GetNetworkAdapters returns all network adapters from ipconfig /all
func GetNetworkAdapters() ([]NetworkAdapter, error) {
    cmd := exec.Command("ipconfig", "/all")
    output, err := cmd.Output()
    if err != nil {
        return nil, err
    }
    
    // Parse output and create NetworkAdapter objects
    // ... parsing logic here ...
    
    return adapters, nil
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "message": "Error description"
}
```

Validation errors include field details:

```json
{
  "message": "Validation error",
  "errors": {
    "macAddress": ["Invalid format. Expected XX:XX:XX:XX:XX:XX"],
    "status": ["Invalid enum value. Expected 'online' | 'offline' | 'away'"]
  }
}
```

---

## Recommended Agent Workflow

### Initial Setup
1. Store API token in secure configuration
2. Call `/api/agent/heartbeat` to verify connectivity

### Periodic Sync (Recommended)
Run every 30-60 seconds:

1. Scan local network for devices
2. Collect MAC addresses, hostnames, and IP addresses
3. Call `PUT /api/agent/devices/sync` with all discovered devices

### Event-Based Updates (Optional)
When a device state changes:

1. Call `POST /api/agent/devices` to register/update a single device
2. Use `PATCH /api/agent/devices/:id` for status-only updates

---

## Example: Go Agent Code

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type Device struct {
    Name       string `json:"name"`
    MacAddress string `json:"macAddress,omitempty"`
    Status     string `json:"status"`
    IPAddress  string `json:"ipAddress,omitempty"`
}

type SyncRequest struct {
    Devices []Device `json:"devices"`
}

type SyncResponse struct {
    Created int `json:"created"`
    Updated int `json:"updated"`
    Deleted int `json:"deleted"`
}

func syncDevices(baseURL, token string, devices []Device) (*SyncResponse, error) {
    reqBody := SyncRequest{Devices: devices}
    jsonData, err := json.Marshal(reqBody)
    if err != nil {
        return nil, err
    }

    req, err := http.NewRequest("PUT", baseURL+"/api/agent/devices/sync", bytes.NewBuffer(jsonData))
    if err != nil {
        return nil, err
    }

    req.Header.Set("Authorization", "Bearer "+token)
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{Timeout: 30 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("sync failed with status: %d", resp.StatusCode)
    }

    var result SyncResponse
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, err
    }

    return &result, nil
}

type HeartbeatRequest struct {
    AgentUUID  string `json:"agentUuid"`
    MACAddress string `json:"macAddress"`
    Hostname   string `json:"hostname"`
    IPAddress  string `json:"ipAddress,omitempty"`
}

type HeartbeatResponse struct {
    Status     string `json:"status"`
    ServerTime string `json:"serverTime"`
    Message    string `json:"message,omitempty"`
}

func heartbeat(baseURL, token string, agentUUID, macAddress, hostname, ipAddress string) (*HeartbeatResponse, error) {
    body := HeartbeatRequest{
        AgentUUID:  agentUUID,
        MACAddress: macAddress,
        Hostname:   hostname,
        IPAddress:  ipAddress,
    }
    
    jsonBody, err := json.Marshal(body)
    if err != nil {
        return nil, err
    }
    
    req, err := http.NewRequest("POST", baseURL+"/api/agent/heartbeat", bytes.NewBuffer(jsonBody))
    if err != nil {
        return nil, err
    }

    req.Header.Set("Authorization", "Bearer "+token)
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{Timeout: 10 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("heartbeat failed with status: %d", resp.StatusCode)
    }

    var result HeartbeatResponse
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, err
    }

    return &result, nil
}
```

---

## Rate Limits

Currently no rate limits are enforced, but please be reasonable:
- Heartbeat: Every 60 seconds maximum
- Sync: Every 30 seconds maximum
- Individual updates: As needed for real-time status changes

---

## Changelog

**v1.2.0** (January 2026)
- Added pending replacement workflow for agent identity conflicts
- New `pending_reauthorization` status in heartbeat response
- Dashboard UI shows side-by-side comparison of current vs pending agent
- User can approve replacement or keep current agent
- New endpoints: `/api/agent-tokens/:id/approve-replacement` and `/api/agent-tokens/:id/reject-pending`

**v1.1.0** (January 2026)
- Added UUID-based agent identity (agentUuid field in heartbeat)
- Agent mismatch detection now uses UUID instead of MAC address
- Improved security with stable agent identification

**v1.0.0** (January 2024)
- Initial release
- Token-based authentication
- Device registration, update, delete
- Bulk sync endpoint
- MAC address-based device matching
