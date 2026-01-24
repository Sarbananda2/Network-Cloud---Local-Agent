# NetworkCloud Application Workflow

This document provides a complete overview of all workflows in the NetworkCloud application, including user journeys, agent interactions, and system flows.

> **Accuracy Note**: This document reflects the codebase as of January 2026. File paths, line numbers, and implementation details are based on code verification. For the most current implementation, always refer to the source code.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Program Start Sequence](#program-start-sequence)
3. [Authentication Flow](#authentication-flow)
4. [Agent Token Lifecycle](#agent-token-lifecycle)
5. [Agent Connection Workflow](#agent-connection-workflow)
6. [Device Management Flow](#device-management-flow)
7. [Account Management](#account-management)
8. [State Diagrams](#state-diagrams)

---

## System Overview

NetworkCloud consists of three main components:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NetworkCloud System                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐   │
│   │   Web App    │◄───────►│   Backend    │◄───────►│   Database   │   │
│   │  (React UI)  │  HTTP   │  (Express)   │   SQL   │ (PostgreSQL) │   │
│   └──────────────┘         └──────────────┘         └──────────────┘   │
│          │                        ▲                                      │
│          │                        │                                      │
│     User Browser              Agent API                                  │
│          │                        │                                      │
│          ▼                        │                                      │
│   ┌──────────────┐         ┌──────────────┐                             │
│   │    User      │         │ Local Agent  │                             │
│   │  (Browser)   │         │  (Go/.exe)   │                             │
│   └──────────────┘         └──────────────┘                             │
│                                   │                                      │
│                            Local Network                                 │
│                                   │                                      │
│                            ┌──────────────┐                             │
│                            │   Devices    │                             │
│                            │ (IoT, PCs)   │                             │
│                            └──────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Component | Description |
|-----------|-------------|
| **Web App** | Read-only dashboard for viewing devices and managing agent tokens |
| **Backend** | Express.js API handling authentication, device data, and agent API |
| **Local Agent** | External application (not part of this codebase) that runs on user's network and calls the Agent API. See [docs/AGENT_API.md](./AGENT_API.md) and [docs/AGENT_BUILD_GUIDE.md](./AGENT_BUILD_GUIDE.md) for implementation guidance. |
| **Agent Token** | API credential that authorizes an agent to sync devices for a user |

> **Note**: The local agent is a separate application that users build and deploy on their own infrastructure. This web application only provides the API endpoints and dashboard UI for managing agents and viewing device data.

---

## Program Start Sequence

### Server Boot (Backend)

When the application starts, the following sequence occurs (see `server/index.ts`):

```
npm run dev
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Server Bootstrap                                  │
└─────────────────────────────────────────────────────────────────────────┘

1. Create Express application (server/index.ts line 6)
    │
    ▼
2. Create HTTP server (server/index.ts line 7)
    │
    ▼
3. Call registerRoutes(httpServer, app) (server/routes.ts)
    │
    ├── setupAuth(app) (server/replit_integrations/auth/replitAuth.ts)
    │   ├── Express session middleware with connect-pg-simple
    │   │   (PostgreSQL-backed session storage, table: "sessions")
    │   ├── Passport initialize + session middleware
    │   ├── OIDC strategy via openid-client
    │   └── Auth endpoints:
    │       ├── GET /api/login → Initiates OIDC flow
    │       ├── GET /api/callback → Processes auth response
    │       └── GET /api/logout → Ends session
    │
    ├── registerAuthRoutes(app) (server/replit_integrations/auth/routes.ts)
    │   └── GET /api/auth/user → Returns current authenticated user
    │
    ├── User API routes (server/routes.ts)
    │   └── /api/devices, /api/agent-tokens, /api/account, etc.
    │
    └── Agent API routes (server/routes.ts)
        └── /api/agent/* (with CORS enabled for external agents)
    │
    ▼
4. Setup Vite (development) or serve static files (production)
    │
    ▼
5. Start HTTP server on port (process.env.PORT || 5000)
   (server/index.ts lines 87-96)
    │
    ▼
Server ready to accept requests
```

### Client Boot (Frontend)

When a user visits the application, the React app initializes:

```
User visits https://networkcloud.tech
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Client Bootstrap                                  │
└─────────────────────────────────────────────────────────────────────────┘

1. Browser loads index.html
    │
    ▼
2. Vite bundles and serves client/src/main.tsx
    │
    ▼
3. React renders App component (client/src/App.tsx)
    │
    ├── QueryClientProvider      ← TanStack React Query setup
    │
    ├── TooltipProvider          ← Radix tooltips
    │
    └── Router (Wouter)          ← URL-based routing
    │
    ▼
4. Route selection based on URL path (client/src/App.tsx)
    │
    ├── /login         → Login page (redirects to /devices if authenticated)
    ├── /devices       → DeviceList (protected)
    ├── /devices/:id   → DeviceDetail (protected)
    ├── /agent-tokens  → AgentTokens (protected)
    ├── /              → Redirect to /devices (if authenticated) or /login
    └── /*             → NotFound
    │
    ▼
5. Protected routes check authentication
    │
    ├── GET /api/auth/user
    │
    └── Decision:
        │
        ├── User authenticated → Render requested page
        │
        └── Not authenticated → Redirect to /login
```

### Route Protection Flow

```
User navigates to protected route (e.g., /devices)
    │
    ▼
┌───────────────────┐
│ useAuth() hook    │
│ fetches           │
│ /api/auth/user    │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    │           │
 Success     Failure
 (200 OK)   (401/Error)
    │           │
    ▼           ▼
┌────────┐  ┌────────────┐
│ Render │  │ Redirect   │
│ Page   │  │ to /login  │
└────────┘  └────────────┘
```

---

## Authentication Flow

### Entry Point: User Visits Application

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Authentication Flow                              │
└─────────────────────────────────────────────────────────────────────────┘

User visits app
      │
      ▼
┌───────────────┐
│ Check Session │
└───────┬───────┘
        │
        ├─── Session Valid ───► Show Dashboard (Device List)
        │
        └─── No Session ───► Show Login Page
                                    │
                                    ▼
                            ┌───────────────┐
                            │  Login Button │
                            └───────┬───────┘
                                    │
                                    ▼
                            ┌───────────────┐
                            │  Replit Auth  │
                            │  (OIDC Flow)  │
                            └───────┬───────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              ┌─────────┐    ┌─────────┐    ┌─────────┐
              │ Google  │    │  Email  │    │ Cancel  │
              │  Login  │    │  (OTP)  │    │         │
              └────┬────┘    └────┬────┘    └────┬────┘
                   │              │              │
                   └──────────────┴──────────────┘
                                  │
                                  ▼
                          ┌───────────────┐
                          │   Callback    │
                          │   /api/callback│
                          └───────┬───────┘
                                  │
                          ┌───────┴───────┐
                          │               │
                    Success           Failure
                          │               │
                          ▼               ▼
                   Create/Update     Show Error
                   User Record       Return to Login
                          │
                          ▼
                   Redirect to Dashboard
```

### Authentication Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/login` | GET | Initiates OIDC authentication flow |
| `/api/callback` | GET | Processes auth response, creates session |
| `/api/logout` | GET | Ends session, redirects to OIDC logout |
| `/api/auth/user` | GET | Returns current authenticated user |

### Session Management

- Sessions stored in PostgreSQL via `connect-pg-simple`
- Session cookie: `connect.sid`
- Protected routes require valid session (middleware: `isAuthenticated`)

---

## Agent Token Lifecycle

### Token States

The token lifecycle is gated by two key fields in the database:
- `approved` (boolean): `false` = agent cannot sync devices, `true` = agent can sync
- `revokedAt` (timestamp): When set, token is permanently deactivated

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Agent Token States                                │
└─────────────────────────────────────────────────────────────────────────┘

                            ┌─────────────────────┐
                            │   TOKEN CREATED      │
                            │   approved=false     │
                            │   agentUuid=null     │
                            │   revokedAt=null     │
                            │   (Never Connected)  │
                            └──────────┬──────────┘
                                       │
                              Agent sends first heartbeat
                              (stores agentUuid, MAC, hostname)
                              (approved remains false)
                                       │
                                       ▼
                            ┌─────────────────────┐
                            │   PENDING APPROVAL   │
                            │   approved=false     │◄────────┐
                            │   agentUuid=set      │         │
                            │   revokedAt=null     │         │
                            │   (Returns:          │         │
                            │   pending_approval)  │         │
                            └──────────┬──────────┘         │
                                       │                     │
          ┌────────────────────────────┼─────────────────────┤
          │                            │                     │
    User Approves              User Rejects           User Revokes Token
    POST .../approve           POST .../reject        DELETE .../:id
    (approved→true)            (clears agent info,    (revokedAt→now)
          │                     approved stays false)       │
          │                            │                     │
          ▼                            └─── Returns to ──────┤
    ┌─────────────────────┐                TOKEN CREATED     │
    │   APPROVED           │                                 │
    │   approved=true      │                                 ▼
    │   agentUuid=set      │                         ┌─────────────┐
    │   revokedAt=null     │                         │   REVOKED   │
    │   (Returns: ok)      │                         │  revokedAt  │
    └──────────┬──────────┘                          │   is set    │
               │                                     │  (Terminal) │
    Different agent sends heartbeat                  └─────────────┘
    (agentUuid already set, new UUID detected)
    (pendingAgentUuid fields populated)
    (approved remains true)
               │
               ▼
    ┌─────────────────────┐
    │   PENDING            │
    │   REPLACEMENT        │
    │   approved=true      │  ← Current agent still works
    │   agentUuid=current  │
    │   pendingAgentUuid   │  ← New agent waiting
    │   =new               │
    │   (Returns to NEW:   │
    │   pending_           │
    │   reauthorization)   │
    │   (Returns to OLD:   │
    │   ok)                │
    └──────────┬──────────┘
               │
    ┌──────────┼──────────┬──────────────────┐
    │          │          │                  │
  Approve   Reject     Revoke Token
  Replace   Pending    DELETE .../:id
  POST      POST       (revokedAt→now)
  .../:id/  .../:id/          │
  approve-  reject-           │
  replace   pending           │
    │          │              │
    ▼          ▼              ▼
  New agent  pending      REVOKED
  replaces   fields       (Terminal)
  current    cleared
  (agent     (current
   info      agent
   updated)  retained)
```

**Important Notes:**
- "Reject" (pending approval) clears agent info but keeps the token usable for a new agent
- "Revoke" permanently deactivates the token (sets revokedAt)
- Pending replacement only occurs when an already-approved token receives a heartbeat from a different agentUuid
- The current agent continues to work during pending replacement until user decides

### Token Lifecycle Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent-tokens` | GET | List all tokens for user |
| `/api/agent-tokens` | POST | Create new token (returns plain token once) |
| `/api/agent-tokens/:id` | DELETE | Revoke a token |
| `/api/agent-tokens/:id/approve` | POST | Approve pending agent |
| `/api/agent-tokens/:id/reject` | POST | Reject and reset pending agent |
| `/api/agent-tokens/:id/approve-replacement` | POST | Approve replacement agent |
| `/api/agent-tokens/:id/reject-pending` | POST | Reject pending, keep current agent |

### Token Security

- Tokens are SHA-256 hashed before storage
- Only the first 8 characters (prefix) are stored for identification
- Full token shown only once at creation time
- Tokens can be revoked but not regenerated

### Token Database State (Technical Detail)

The `agent_tokens` table stores the following state that determines token behavior:

| Field | Type | Description |
|-------|------|-------------|
| `approved` | boolean | `false` = not yet approved (default), `true` = approved |
| `agentUuid` | string (nullable) | UUID of the currently connected agent |
| `agentMacAddress` | string (nullable) | MAC address of the agent's primary network interface |
| `agentHostname` | string (nullable) | Hostname of the machine running the agent |
| `agentIpAddress` | string (nullable) | IP address reported by the agent |
| `pendingAgentUuid` | string (nullable) | UUID of a different agent attempting to use this token |
| `pendingAgentMacAddress` | string (nullable) | MAC of pending replacement agent |
| `pendingAgentHostname` | string (nullable) | Hostname of pending replacement agent |
| `pendingAgentIpAddress` | string (nullable) | IP of pending replacement agent |
| `pendingAgentAt` | timestamp (nullable) | When the pending replacement was detected |

**State Transitions:**

1. **Token Created**: `approved=false`, all agent fields null (never connected state)
2. **First Heartbeat**: Agent info stored, `approved` remains `false` → returns `pending_approval`
3. **User Approves**: `approved=true` → subsequent heartbeats return `ok`
4. **User Rejects**: Agent fields cleared, `approved=false` → back to "never connected" state
5. **Different Agent Heartbeat**: Pending fields populated → returns `pending_reauthorization`
6. **Approve Replacement**: Pending agent becomes current, pending fields cleared, `approved=true`
7. **Reject Pending**: Pending fields cleared, current agent retained

---

## Agent Connection Workflow

### Initial Connection (First Heartbeat)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Agent Initial Connection Flow                         │
└─────────────────────────────────────────────────────────────────────────┘

Agent starts with token
        │
        ▼
┌───────────────────┐
│ POST /api/agent/  │
│    heartbeat      │
│ {agentUuid, mac,  │
│  hostname}        │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Validate Token    │
│ (SHA-256 hash)    │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    │           │
  Valid      Invalid
    │           │
    ▼           ▼
┌────────┐  ┌────────┐
│Continue│  │  401   │
│        │  │Unauth. │
└───┬────┘  └────────┘
    │
    ▼
┌───────────────────┐
│ Check: Is this    │
│ token's first     │
│ connection?       │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    │           │
   Yes          No
    │           │
    ▼           ▼
┌────────────┐ ┌────────────────┐
│Store agent │ │ Check: Same    │
│info        │ │ agentUuid?     │
│(approved   │ └───────┬────────┘
│ stays      │         │
│ false)     │   ┌─────┴─────┐
└─────┬──────┘   │           │
      │         Same     Different
      ▼          │           │
┌────────────┐   ▼           ▼
│Return:     │ ┌──────┐  ┌──────────────┐
│"pending_   │ │ "ok" │  │Store pending │
│ approval"  │ └──────┘  │agent info    │
└────────────┘           │(approved     │
                         │ stays true)  │
                         └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                         │   Return:    │
                         │"pending_     │
                         │reauthorization"│
                         └──────────────┘
```

### Heartbeat Response Status Values

| Status | Meaning | Agent Action |
|--------|---------|--------------|
| `ok` | Approved and connected | Proceed with device sync |
| `pending_approval` | First connection, awaiting approval | Keep heartbeating, don't sync |
| `pending_reauthorization` | Different agent using token | Keep heartbeating, don't sync |

### Agent Decision Tree

```
Agent receives heartbeat response
              │
              ▼
┌─────────────────────────┐
│ Check response status   │
└───────────┬─────────────┘
            │
    ┌───────┼───────┬───────────────┐
    │       │       │               │
   "ok"  "pending_  "pending_    Error
         approval"  reauthorization"│
    │       │       │               │
    ▼       ▼       ▼               ▼
Sync     Wait &   Wait &        Retry or
Devices  Retry    Retry         Log Error
         (30s)    (30s)         
    │       │       │
    ▼       │       │
┌──────┐    │       │
│Bulk  │    │       │
│Sync  │    │       │
│API   │    │       │
└──────┘    │       │
            │       │
            └───────┴─── Continue heartbeat loop
```

---

## Device Management Flow

> **Note on External Agent Behavior**: The device discovery process (network scanning, ping sweeps, ARP lookups) happens entirely within the local agent application, which is external to this codebase. This web application only receives and stores the device data that the agent pushes via the API. See [docs/AGENT_BUILD_GUIDE.md](./AGENT_BUILD_GUIDE.md) for guidance on implementing the agent.

### Device Sync (Agent → Backend)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Device Sync Flow                                 │
└─────────────────────────────────────────────────────────────────────────┘

Agent scans local network (EXTERNAL - not part of this codebase)
        │
        ▼
┌───────────────────┐
│ Discover devices  │
│ (implementation   │
│ varies by agent)  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Build device list │
│ with MAC, IP,     │
│ hostname, status  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ PUT /api/agent/devices/sync           │
│ {                                     │
│   devices: [                          │
│     {macAddress, name, status, ip}    │
│   ]                                   │
│ }                                     │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ Backend processes sync:               │
│ 1. Create new devices (by MAC)        │
│ 2. Update existing devices            │
│ 3. Delete devices not in list         │
│ 4. Update network state (IP, etc)     │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ Return sync results:                  │
│ {created: N, updated: N, deleted: N}  │
└───────────────────────────────────────┘
```

### Device Display (Backend → User)

```
User views Dashboard
        │
        ▼
┌───────────────────┐
│ GET /api/devices  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Return devices    │
│ with status,      │
│ timestamps        │
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Display Device List:                  │
│ - Name                                │
│ - Status (online/offline/away)        │
│ - Last seen timestamp                 │
│ - MAC address                         │
└───────────────────────────────────────┘
          │
          ▼
User clicks device
          │
          ▼
┌───────────────────┐
│ GET /api/devices/ │
│ :id/network-state │
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Display Device Detail:                │
│ - WiFi IP address                     │
│ - Network state info                  │
│ - Availability history                │
└───────────────────────────────────────┘
```

### Device Status Values

| Status | Meaning | Visual Indicator |
|--------|---------|------------------|
| `online` | Device responding to network checks | Green dot |
| `offline` | Device not responding | Red dot |
| `away` | Device was online but hasn't been seen recently | Yellow/amber dot |

---

## Account Management

### Account Deletion Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Account Deletion Flow                               │
└─────────────────────────────────────────────────────────────────────────┘

User clicks "Delete Account"
        │
        ▼
┌───────────────────┐
│ Confirmation      │
│ Dialog            │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    │           │
 Cancel      Confirm
    │           │
    ▼           ▼
  Close    ┌────────────────┐
  Dialog   │ DELETE         │
           │ /api/account   │
           └───────┬────────┘
                   │
                   ▼
           ┌────────────────┐
           │ Backend:       │
           │ 1. Delete all  │
           │    devices     │
           │ 2. Delete all  │
           │    tokens      │
           │ 3. Delete user │
           │ 4. End session │
           └───────┬────────┘
                   │
                   ▼
           ┌────────────────┐
           │ Redirect to    │
           │ Login page     │
           └────────────────┘
```

---

## State Diagrams

> **Note**: The detailed Agent Token State Machine is documented in the [Agent Token Lifecycle](#agent-token-lifecycle) section above with precise database field values at each state.

### User Session State Machine

```
         ┌─────────────────┐
         │                 │
         │   ANONYMOUS     │◄──────────────┐
         │   (No Session)  │               │
         └────────┬────────┘               │
                  │                        │
             Click Login                   │
                  │                        │
                  ▼                        │
         ┌─────────────────┐               │
         │   OIDC FLOW     │               │
         │   (In Progress) │               │
         └────────┬────────┘               │
                  │                        │
         ┌────────┼────────┐               │
         │        │        │               │
      Success  Cancel   Failure            │
         │        │        │               │
         │        └────────┴───────────────┤
         ▼                                 │
  ┌─────────────────┐                      │
  │  AUTHENTICATED  │                      │
  │  (Has Session)  │──── Logout ──────────┤
  └────────┬────────┘                      │
           │                               │
    Delete Account                         │
           │                               │
           ▼                               │
  ┌─────────────────┐                      │
  │    DELETED      │──────────────────────┘
  │   (Terminal)    │
  └─────────────────┘
```

---

## Complete User Journey

### First-Time User Journey

```
1. User visits NetworkCloud
         │
         ▼
2. Sees Login page (no session)
         │
         ▼
3. Clicks "Login with Replit"
         │
         ▼
4. Chooses Google or Email auth
         │
         ▼
5. Completes authentication
         │
         ▼
6. Redirected to Dashboard
         │
         ▼
7. Sees empty device list (no agents yet)
         │
         ▼
8. Navigates to "Agent Tokens" page
         │
         ▼
9. Creates new agent token
         │
         ▼
10. Copies token (shown only once!)
         │
         ▼
11. Installs local agent on Windows PC
         │
         ▼
12. Configures agent with token
         │
         ▼
13. Agent starts, sends first heartbeat
         │
         ▼
14. Dashboard shows "Pending Approval"
         │
         ▼
15. User approves agent
         │
         ▼
16. Agent receives "ok", starts syncing
         │
         ▼
17. Devices appear on Dashboard
         │
         ▼
18. User views device details and IPs
```

### Agent Replacement Journey

```
1. User has approved agent on PC-A
         │
         ▼
2. User moves token to new PC-B
         │
         ▼
3. Agent on PC-B sends heartbeat
         │
         ▼
4. Backend detects different agentUuid
         │
         ▼
5. Stores PC-B as "pending replacement"
         │
         ▼
6. Returns "pending_reauthorization" to PC-B
         │
         ▼
7. Dashboard shows "Pending Replacement" section
         │
         ▼
8. User sees side-by-side comparison:
   - Current Agent: PC-A info
   - Pending Agent: PC-B info
         │
         ├─────────────────┬─────────────────┐
         │                 │                 │
   "Replace"         "Keep Current"     "Revoke"
         │                 │                 │
         ▼                 ▼                 ▼
   PC-B becomes      PC-A stays        Token
   active agent      active agent      deactivated
         │                 │                 │
         ▼                 ▼                 ▼
   PC-B syncs       PC-B blocked      Both agents
   devices          indefinitely       stopped
```

---

## API Quick Reference

### User-Facing Endpoints (Session Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/user` | GET | Get current user |
| `/api/devices` | GET | List user's devices |
| `/api/devices/:id` | GET | Get device details |
| `/api/devices/:id/network-state` | GET | Get device network info |
| `/api/agent-tokens` | GET | List agent tokens |
| `/api/agent-tokens` | POST | Create token |
| `/api/agent-tokens/:id` | DELETE | Revoke token |
| `/api/agent-tokens/:id/approve` | POST | Approve pending agent |
| `/api/agent-tokens/:id/reject` | POST | Reject pending agent |
| `/api/agent-tokens/:id/approve-replacement` | POST | Approve replacement |
| `/api/agent-tokens/:id/reject-pending` | POST | Reject pending replacement |
| `/api/account` | DELETE | Delete account |

### Agent API (Bearer Token Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent/heartbeat` | POST | Agent registration/status check |
| `/api/agent/devices` | POST | Register device |
| `/api/agent/devices/:id` | PATCH | Update device |
| `/api/agent/devices/:id` | DELETE | Delete device |
| `/api/agent/devices/sync` | PUT | Bulk sync devices |

---

## Error Handling

### Common Error Scenarios

| Scenario | HTTP Code | Response | Resolution |
|----------|-----------|----------|------------|
| Invalid session | 401 | Redirect to login | Re-authenticate |
| Invalid token | 401 | `{"message": "Unauthorized"}` | Check token validity |
| Token revoked | 401 | `{"message": "Unauthorized"}` | Create new token |
| Device not found | 404 | `{"message": "Device not found"}` | Check device ID |
| Unauthorized access | 403/401 | `{"message": "Unauthorized"}` | User doesn't own resource |
| Validation error | 400 | `{"message": "Validation error"}` | Fix request body |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.2.0 | January 2026 | Added pending replacement workflow |
| 1.1.0 | January 2026 | Added UUID-based agent identity |
| 1.0.0 | January 2024 | Initial release |
