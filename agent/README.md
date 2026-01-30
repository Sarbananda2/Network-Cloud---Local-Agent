# NetworkCloud Agent (Go)

This folder contains the Go implementation of the NetworkCloud agent. It runs as a Windows service or a foreground CLI, links using OAuth device flow, and syncs network adapter data to the NetworkCloud API.

## Configuration

Copy `config.example.yaml` to `agent.yaml` and update values:

- Windows default config path: `%APPDATA%\\NetworkCloud\\agent.yaml`
- Local override: `--config C:\\path\\to\\agent.yaml`

Key settings:

- `server_url` (required, must be https)
- `heartbeat_interval` (seconds)
- `sync_interval` (seconds)
- `network_check_interval` (seconds)
- `log_level` (`debug`, `info`, `warn`, `error`)
- `log_file` (optional)
- `auto_start` (default true)

## Linking the Agent

Use device flow to link the agent to your account:

```
agent --link
```

Follow the printed URL and code. Tokens are stored at:

`%APPDATA%\\NetworkCloud\\.token`

To unlink:

```
agent --unlink
```

Status:

```
agent --status
```

## Running

Foreground mode:

```
agent run
```

Single scan (adapter list):

```
agent scan
```

## Windows Service

Run as Administrator:

```
agent install
agent start
agent stop
agent uninstall
```

## GUI (Wails)

The GUI is a separate app that talks to the local control API over `127.0.0.1:17880`.
It shows local adapter/network details directly from the machine (no cloud dependency).

Build and run UI (from `agent/ui`):

```
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails dev
```

The UI reads the local control token from:

`%APPDATA%\\NetworkCloud\\.control_token`

Ensure the agent service is running so the control API is available.

### Network Info

The UI shows local adapter details from the machine (not from the cloud). Use the **Network** section to view all adapters and refresh on demand.

## Development

Before committing:

```
go fmt ./...
go vet ./...
go test ./...
go build -o agent.exe
```

