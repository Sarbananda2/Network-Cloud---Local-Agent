# NetworkCloud Agent - Project Context

This document provides context for Cursor AI about the NetworkCloud project and what we're building.

---

## What is NetworkCloud?

NetworkCloud is a web-based network monitoring application that allows users to view and track devices on their local networks from anywhere. Think of it as a "remote view" into your home or office network.

### The Problem We're Solving

- Users want to see what devices are connected to their network
- They want to check device status (online/offline) remotely
- They need to see IP addresses for remote access or troubleshooting
- Traditional network tools require being on the same network

### Our Solution

A two-part system:
1. **Web Application** (already built) - Hosted dashboard for viewing devices
2. **Local Agent** (what you're building) - Windows service that discovers devices and reports to the web app

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S NETWORK                           │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Phone   │  │  Laptop  │  │  Smart   │  │  Server  │  ...   │
│  │          │  │          │  │    TV    │  │          │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       └─────────────┴──────┬──────┴─────────────┘               │
│                            │                                    │
│                     ┌──────▼──────┐                             │
│                     │   Router    │                             │
│                     └──────┬──────┘                             │
│                            │                                    │
│  ┌─────────────────────────▼─────────────────────────────────┐  │
│  │               NETWORKCLOUD AGENT (You build this)         │  │
│  │                                                           │  │
│  │  • Scans network every 60 seconds                        │  │
│  │  • Discovers devices via ping + ARP                      │  │
│  │  • Collects: IP, MAC address, hostname                   │  │
│  │  • Reports to web API                                    │  │
│  │  • Runs as Windows Service                               │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             │ HTTPS (Internet)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NETWORKCLOUD WEB APP                          │
│                   (Already built on Replit)                     │
│                                                                 │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐   │
│  │   Frontend    │    │    Backend    │    │   Database    │   │
│  │   (React)     │◄──►│   (Express)   │◄──►│  (PostgreSQL) │   │
│  └───────────────┘    └───────────────┘    └───────────────┘   │
│                                                                 │
│  Features:                                                      │
│  • User authentication (Google login)                          │
│  • Device dashboard                                            │
│  • Agent token management                                      │
│  • API for agents to report data                              │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                          USER                                   │
│                                                                 │
│  Views their network devices from anywhere:                    │
│  • Phone, laptop, any browser                                  │
│  • See which devices are online/offline                       │
│  • Check IP addresses                                          │
│  • Monitor network health                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Agent's Role

The agent is the "eyes" on the local network. It:

1. **Runs continuously** as a Windows Service
2. **Scans the network** every 60 seconds
3. **Discovers devices** using ping sweep and ARP table
4. **Reports to the cloud** via secure HTTPS API
5. **Authenticates** using a token generated in the web dashboard

### What the Agent Does NOT Do

- Does NOT serve any UI (the web app does that)
- Does NOT store data permanently (the web app's database does)
- Does NOT require user interaction after initial setup
- Does NOT need to handle multiple users (one agent = one user's network)

---

## User Journey

1. User signs up on NetworkCloud web app (Google login)
2. User creates an "Agent Token" in the dashboard
3. User downloads/installs the agent on a Windows PC on their network
4. User configures the agent with their token
5. User starts the agent (runs as Windows Service)
6. Agent scans network and reports devices
7. User views devices in the web dashboard from anywhere

---

## Technical Details

### Web App (Already Built)

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Replit Auth (Google OAuth)
- **Hosting**: Replit
- **Domain**: networkcloud.tech (planned)

### Agent (What You're Building)

- **Language**: Go
- **Platform**: Windows (primary), potentially macOS/Linux later
- **Deployment**: Windows Service
- **Dependencies**: Minimal (no Npcap required)
- **Config**: YAML file

---

## API Contract Summary

The agent communicates with these endpoints:

### Authentication
```
Authorization: Bearer nc_xxxxxxxxxxxxx
```
Token is created in web dashboard and stored in agent's config.yaml.

### Heartbeat
```
POST /api/agent/heartbeat
→ { "status": "ok", "serverTime": "..." }
```
Confirms connectivity and token validity.

### Sync Devices
```
PUT /api/agent/devices/sync
← { "devices": [...] }
→ { "created": N, "updated": N, "deleted": N }
```
Reports all discovered devices. The API automatically:
- Creates new devices not seen before
- Updates existing devices (by MAC address match)
- Deletes devices not in the list (device went offline/removed)

### Full API Documentation
See `../docs/AGENT_API.md` for complete endpoint details.

---

## Data Model

### Device (what the agent reports)
```
{
  "name": "DESKTOP-ABC123",     // Hostname or friendly name
  "macAddress": "AA:BB:CC:DD:EE:FF",  // Hardware address
  "status": "online",           // online, offline, or away
  "ipAddress": "192.168.1.100"  // Current IP address
}
```

### What Makes Devices Unique
MAC address is the primary identifier. When syncing:
- Same MAC = update existing device
- New MAC = create new device
- Missing MAC (from previous sync) = device deleted

---

## Design Philosophy

### Simplicity First
- No complex dependencies (no Npcap, no admin consoles)
- Single executable for easy distribution
- YAML config for easy editing

### Reliability
- Graceful error handling (don't crash on network issues)
- Retry logic for API failures
- Clean shutdown when stopping service

### Security
- Token-based authentication (no username/password)
- HTTPS only for API communication
- Tokens hashed in database (can't be recovered if lost)

### User Experience
- Set it and forget it (runs as background service)
- Auto-start on Windows boot
- Minimal resource usage

---

## Success Criteria

The agent is "done" when:

1. ✅ Installs as Windows Service with simple command
2. ✅ Automatically starts on Windows boot
3. ✅ Scans local network and discovers devices
4. ✅ Reports devices to NetworkCloud API
5. ✅ Handles network/API errors gracefully
6. ✅ Runs indefinitely without memory leaks or crashes
7. ✅ Can be cleanly stopped and uninstalled
8. ✅ Works without any additional software installation

---

## Development Approach

### Build Order (Recommended)

1. **Configuration** - Load settings from YAML file
2. **API Client** - Connect to NetworkCloud API, heartbeat
3. **Network Scanner** - Discover devices on local network
4. **Main Loop** - Combine scanning and reporting
5. **Windows Service** - Wrap in service for production

### Testing Strategy

1. Test each component in isolation
2. Test full flow in foreground mode (`agent.exe run`)
3. Verify devices appear in web dashboard
4. Test service install/start/stop/uninstall cycle
5. Test error scenarios (no network, bad token, API down)

---

## Questions to Consider

As you build, think about:

1. **What if the network is down?** → Queue data? Skip cycle?
2. **What if the API is slow?** → Timeout and retry?
3. **What if a device has no hostname?** → Use "Unknown" or IP?
4. **What if MAC format varies?** → Normalize to AA:BB:CC:DD:EE:FF
5. **What if config file is missing?** → Error message with setup instructions

---

## Files to Reference

| File | Purpose |
|------|---------|
| `../docs/AGENT_API.md` | Complete API documentation |
| `../docs/AGENT_BUILD_GUIDE.md` | Build instructions and coding rules |
| `config.example.yaml` | Sample configuration (create this) |
| `README.md` | Agent-specific usage instructions (create this) |

---

## Let's Build!

Start with the configuration loader, then the API client. Once you can send a heartbeat, add network scanning. Finally, wrap it all in a Windows Service.

Good luck! 🚀
