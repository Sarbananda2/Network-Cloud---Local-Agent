# OAuth Device Flow - Agent Linking

This document describes the OAuth Device Flow implementation for linking local agents to user accounts without manual token management.

---

## Overview

Instead of users manually creating and copying tokens, the agent initiates a device authorization flow. Users visit a web page, enter a short code, and approve the device. The agent automatically receives its token.

**Industry Examples**: Tailscale, GitHub CLI, Azure CLI, Docker CLI, Stripe CLI

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OAUTH DEVICE FLOW - AGENT LINKING                        │
└─────────────────────────────────────────────────────────────────────────────┘

    LOCAL AGENT                         WEB SERVER                      USER
    (Windows/Go)                     (NetworkCloud)                  (Browser)
         │                                 │                             │
         │  1. User runs: agent login      │                             │
         │─────────────────────────────────>                             │
         │                                 │                             │
         │  2. POST /api/device/authorize  │                             │
         │  {hostname, macAddress}         │                             │
         │─────────────────────────────────>                             │
         │                                 │                             │
         │  3. Returns:                    │                             │
         │  {                              │                             │
         │    device_code: "abc123...",    │                             │
         │    user_code: "ABCD-1234",      │                             │
         │    verification_uri: ".../link",│                             │
         │    expires_in: 900              │                             │
         │  }                              │                             │
         │<─────────────────────────────────                             │
         │                                 │                             │
         ├─────────────────────────────────────────────────────────────────┐
         │  4. Agent displays to user:                                    │
         │  ┌────────────────────────────────────────────────────────┐    │
         │  │  To link this device, visit:                           │    │
         │  │  https://networkcloud.example.com/link                 │    │
         │  │                                                        │    │
         │  │  And enter code: ABCD-1234                             │    │
         │  └────────────────────────────────────────────────────────┘    │
         ├─────────────────────────────────────────────────────────────────┘
         │                                 │                             │
         │                                 │   5. User visits /link      │
         │                                 │<─────────────────────────────
         │                                 │                             │
         │                                 │   6. Login required         │
         │                                 │   (Replit Auth OIDC)        │
         │                                 │<────────────────────────────>
         │                                 │                             │
         │                                 │   7. Enter code: ABCD-1234  │
         │                                 │<─────────────────────────────
         │                                 │                             │
         │                                 │   8. Show device info:      │
         │                                 │   "Link DESKTOP-PC?"        │
         │                                 │   [Approve] [Deny]          │
         │                                 │─────────────────────────────>
         │                                 │                             │
         │                                 │   9. User clicks [Approve]  │
         │                                 │<─────────────────────────────
         │                                 │                             │
    ┌────┴────┐                            │                             │
    │ POLLING │  10. POST /api/device/token                              │
    │ (every  │  {device_code: "abc123..."}│                             │
    │ 5 sec)  │─────────────────────────────>                            │
    └────┬────┘                            │                             │
         │                                 │                             │
         │  11. Before approval returns:   │                             │
         │  {"error": "authorization_pending"}                           │
         │<─────────────────────────────────                             │
         │                                 │                             │
         │  12. After approval returns:    │                             │
         │  {                              │                             │
         │    access_token: "tok_xyz...",  │                             │
         │    agent_uuid: "uuid-here"      │                             │
         │  }                              │                             │
         │<─────────────────────────────────                             │
         │                                 │                             │
         ├─────────────────────────────────────────────────────────────────┐
         │  13. Agent saves token & displays:                             │
         │  ┌────────────────────────────────────────────────────────┐    │
         │  │  ✓ Successfully linked to NetworkCloud!                │    │
         │  │  Agent is now running...                               │    │
         │  └────────────────────────────────────────────────────────┘    │
         ├─────────────────────────────────────────────────────────────────┘
         │                                 │                             │
         │  14. Normal operation begins    │                             │
         │  POST /api/agent/heartbeat      │                             │
         │  POST /api/agent/devices        │                             │
         │─────────────────────────────────>                             │
         │                                 │                             │
```

---

## API Endpoints

### 1. Request Device Authorization

**Endpoint**: `POST /api/device/authorize`

**Request** (no authentication required):
```json
{
  "hostname": "DESKTOP-PC",
  "macAddress": "AA:BB:CC:DD:EE:FF"
}
```

**Response**:
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "ABCD-1234",
  "verification_uri": "https://networkcloud.example.com/link",
  "expires_in": 900,
  "interval": 5
}
```

| Field | Description |
|-------|-------------|
| `device_code` | Long code for agent to poll with (kept secret) |
| `user_code` | Short human-readable code for user to enter |
| `verification_uri` | URL where user enters the code |
| `expires_in` | Seconds until codes expire (15 minutes) |
| `interval` | Minimum seconds between poll attempts |

---

### 2. Poll for Token

**Endpoint**: `POST /api/device/token`

**Request** (no authentication required):
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS"
}
```

**Response (pending)**:
```json
{
  "error": "authorization_pending"
}
```

**Response (approved)**:
```json
{
  "access_token": "ncat_abc123xyz...",
  "token_type": "Bearer",
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (denied)**:
```json
{
  "error": "access_denied"
}
```

**Response (expired)**:
```json
{
  "error": "expired_token"
}
```

---

### 3. Verify User Code (Web UI)

**Endpoint**: `POST /api/device/verify`

**Request** (requires session authentication):
```json
{
  "user_code": "ABCD-1234"
}
```

**Response (found)**:
```json
{
  "hostname": "DESKTOP-PC",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "createdAt": "2026-01-24T10:30:00Z"
}
```

**Response (not found/expired)**:
```json
{
  "error": "invalid_code"
}
```

---

### 4. Approve/Deny Device

**Endpoint**: `POST /api/device/approve`

**Request** (requires session authentication):
```json
{
  "user_code": "ABCD-1234",
  "approved": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Device linked successfully"
}
```

---

## Database Schema

### New Table: `device_authorizations`

```typescript
export const deviceAuthorizations = pgTable("device_authorizations", {
  id: serial("id").primaryKey(),
  deviceCodeHash: varchar("device_code_hash", { length: 64 }).notNull().unique(),
  userCode: varchar("user_code", { length: 16 }).notNull().unique(),
  hostname: varchar("hostname", { length: 255 }),
  macAddress: varchar("mac_address", { length: 17 }),
  userId: varchar("user_id", { length: 255 }),  // null until approved
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Status Values**:
| Status | Meaning |
|--------|---------|
| `pending` | Waiting for user to enter code and approve |
| `approved` | User approved, waiting for agent to exchange |
| `denied` | User denied the request |
| `exchanged` | Agent successfully exchanged for token |
| `expired` | Code expired before completion |

---

## Security Considerations

### 1. Code Generation
- **device_code**: 40+ character cryptographically random string (stored as SHA-256 hash)
- **user_code**: 8-character alphanumeric, uppercase, easy to type (e.g., "ABCD-1234")

### 2. Rate Limiting
- Limit authorization requests per IP (prevent code exhaustion)
- Enforce minimum polling interval (5 seconds)
- Block after too many invalid code attempts

### 3. Expiration
- Codes expire after 15 minutes
- One-time use: after exchange, authorization is marked `exchanged`

### 4. No Credentials on Device
- Agent never sees user password or session
- Only receives scoped API token after explicit approval

---

## User Experience

### Agent CLI Output
```
$ networkcloud-agent login

Linking this device to your NetworkCloud account...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  To complete linking, visit:
  
  https://networkcloud.example.com/link
  
  And enter code:  ABCD-1234
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Waiting for authorization... (expires in 15 minutes)
```

### Web UI Flow
1. User visits `/link`
2. If not logged in → redirected to login → back to `/link`
3. User enters code "ABCD-1234"
4. UI shows device info: "Link device DESKTOP-PC (AA:BB:CC:DD:EE:FF)?"
5. User clicks [Approve] or [Deny]
6. Success message shown

### Agent Completion
```
✓ Successfully linked to your NetworkCloud account!

Device: DESKTOP-PC
Account: user@example.com

Agent is now running. Press Ctrl+C to stop.
```

---

## Implementation Checklist

### Backend
- [ ] Add `device_authorizations` table to schema
- [ ] Implement `POST /api/device/authorize` endpoint
- [ ] Implement `POST /api/device/token` endpoint (polling)
- [ ] Implement `POST /api/device/verify` endpoint
- [ ] Implement `POST /api/device/approve` endpoint
- [ ] Add background job to clean up expired authorizations
- [ ] Create agent token on approval (reuse existing `agent_tokens` table)

### Frontend
- [ ] Create `/link` page (device linking flow)
- [ ] Code entry form with validation
- [ ] Device info display with approve/deny buttons
- [ ] Success/error states

### Agent (Go, external codebase)
- [ ] `login` command implementation
- [ ] Device code request
- [ ] Polling loop with backoff
- [ ] Token storage in local config
- [ ] Transition to normal operation after linking

---

## Comparison: Before vs After

| Aspect | Manual Tokens (Before) | Device Flow (After) |
|--------|------------------------|---------------------|
| Steps for user | 5+ (create, copy, paste, configure) | 3 (visit URL, enter code, approve) |
| Error prone | Yes (copy/paste errors) | No |
| Token visibility | User sees full token | Never exposed |
| Approval | Implicit | Explicit |
| Industry standard | No | Yes (RFC 8628) |

---

## References

- [RFC 8628: OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628)
- [Tailscale Device Authorization](https://tailscale.com/kb/1085/device-approval)
- [GitHub CLI Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
