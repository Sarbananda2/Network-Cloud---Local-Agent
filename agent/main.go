package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"networkcloud-agent/adapters"
	"networkcloud-agent/api"
	"networkcloud-agent/config"
	"networkcloud-agent/control"
	"networkcloud-agent/logging"
	servicepkg "networkcloud-agent/service"
	"networkcloud-agent/state"
	"networkcloud-agent/token"

	"github.com/kardianos/service"
	"github.com/spf13/cobra"
)

const (
	DefaultVersion = "dev"
)

// Version is set at build time.
var Version = DefaultVersion

type App struct {
	configPath string
	verbose    bool
	link       bool
	unlink     bool
	status     bool
	serverURL  string
	state      *state.Machine
	control    *control.Server
	syncNow    chan struct{}
}

func main() {
	app := &App{
		state: state.New(),
	}
	rootCmd := &cobra.Command{
		Use:   "agent",
		Short: "NetworkCloud network agent",
		RunE: func(cmd *cobra.Command, args []string) error {
			if app.link {
				return app.linkDevice(cmd.Context())
			}
			if app.unlink {
				return app.unlinkDevice()
			}
			if app.status {
				return app.showStatus()
			}
			return cmd.Help()
		},
	}

	rootCmd.PersistentFlags().StringVar(&app.configPath, "config", "", "path to config file")
	rootCmd.PersistentFlags().StringVar(&app.serverURL, "server-url", "", "override server url")
	rootCmd.PersistentFlags().BoolVar(&app.verbose, "verbose", false, "enable debug logging")
	rootCmd.PersistentFlags().BoolVar(&app.link, "link", false, "start device linking flow")
	rootCmd.PersistentFlags().BoolVar(&app.unlink, "unlink", false, "remove device authorization")
	rootCmd.PersistentFlags().BoolVar(&app.status, "status", false, "show current agent status")

	rootCmd.AddCommand(
		newRunCommand(app),
		newScanCommand(app),
		newVersionCommand(),
		newServiceCommand(app, "install"),
		newServiceCommand(app, "uninstall"),
		newServiceCommand(app, "start"),
		newServiceCommand(app, "stop"),
	)

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func newRunCommand(app *App) *cobra.Command {
	return &cobra.Command{
		Use:   "run",
		Short: "run the agent in the foreground",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := withSignalContext()
			return app.run(ctx)
		},
	}
}

func newScanCommand(app *App) *cobra.Command {
	return &cobra.Command{
		Use:   "scan",
		Short: "run a single network scan and print results",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, _, err := app.loadConfig()
			if err != nil {
				return err
			}

			timeout := cfg.NetworkCheckInterval.Duration()
			scanCtx, cancel := context.WithTimeout(cmd.Context(), timeout)
			defer cancel()

			results, err := adapters.Discover(scanCtx)
			if err != nil {
				return err
			}

			for _, adapter := range results {
				fmt.Printf("%s %s %s %v\n", adapter.Name, adapter.Type, adapter.MACAddress, adapter.Connected)
			}

			return nil
		},
	}
}

func newVersionCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "print version information",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("NetworkCloud Agent %s\n", Version)
		},
	}
}

func newServiceCommand(app *App, action string) *cobra.Command {
	return &cobra.Command{
		Use:   action,
		Short: fmt.Sprintf("%s the windows service", action),
		RunE: func(cmd *cobra.Command, args []string) error {
			return app.controlService(action)
		},
	}
}

func (a *App) controlService(action string) error {
	runner := &serviceRunner{app: a}
	program := servicepkg.NewProgram(runner)
	svc, err := servicepkg.NewService(program)
	if err != nil {
		return err
	}

	return service.Control(svc, action)
}

func (a *App) run(ctx context.Context) (runErr error) {
	cfg, configPath, err := a.loadConfig()
	if err != nil {
		return err
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	logger, closer, err := newLogger(cfg, a.verbose)
	if err != nil {
		return err
	}
	defer closer.Close()

	logger.Info("using config file %s", configPath)
	logger.Info("server url %s", cfg.ServerURL)

	if a.syncNow == nil {
		a.syncNow = make(chan struct{}, 1)
	}
	if err := a.startControlServer(cfg.ServerURL, cfg.LogFile, int(cfg.SyncInterval.Duration().Seconds()), cancel); err != nil {
		return err
	}
	defer a.stopControlServer()

	var storedToken *token.StoredToken
	var client *api.Client
	registered := false
	hostname, err := os.Hostname()
	if err != nil {
		return fmt.Errorf("read hostname: %w", err)
	}

	loadToken := func() error {
		loaded, err := token.Load()
		if err != nil {
			return err
		}
		if loaded == nil {
			return nil
		}
		storedToken = loaded
		client = api.NewClient(cfg.ServerURL, storedToken.AccessToken)
		registered = false
		a.state.Set(state.StateAuthorized)
		return nil
	}

	heartbeatTicker := time.NewTicker(cfg.HeartbeatInterval.Duration())
	defer heartbeatTicker.Stop()
	syncTicker := time.NewTicker(cfg.SyncInterval.Duration())
	defer syncTicker.Stop()
	networkTicker := time.NewTicker(cfg.NetworkCheckInterval.Duration())
	defer networkTicker.Stop()
	tokenTicker := time.NewTicker(10 * time.Second)
	defer tokenTicker.Stop()

	var pending []api.Device
	var lastHash string

	revokeAndReset := func() {
		_ = a.handleAuthRevoked()
		storedToken = nil
		client = nil
		registered = false
		pending = nil
		lastHash = ""
	}

	for {
		select {
		case <-runCtx.Done():
			a.state.Set(state.StateStopped)
			return nil
		case <-a.syncNow:
			if storedToken == nil {
				if err := loadToken(); err != nil {
					logger.Warn("token load failed: %v", err)
				}
				if storedToken == nil {
					a.state.Set(state.StateIdle)
					continue
				}
			}
			if !registered {
				if err := ensureRegistered(runCtx, client, storedToken.AgentUUID, hostname, logger); err != nil {
					if isAuthError(err) {
						revokeAndReset()
						continue
					}
					logger.Warn("registration failed: %v", err)
					continue
				}
				registered = true
			}
			devices, err := buildDevicePayloads(ctx, hostname)
			if err != nil {
				logger.Warn("sync build failed: %v", err)
				continue
			}
			var syncErr error
			pending, syncErr = syncWithQueue(ctx, client, logger, pending, devices, true)
			if syncErr != nil {
				if isAuthError(syncErr) {
					revokeAndReset()
					continue
				}
				logger.Warn("sync failed: %v", syncErr)
			}
		case <-tokenTicker.C:
			if storedToken == nil {
				if err := loadToken(); err != nil {
					logger.Warn("token load failed: %v", err)
				}
				if storedToken == nil {
					a.state.Set(state.StateIdle)
					continue
				}
			}
		case <-heartbeatTicker.C:
			if storedToken == nil {
				continue
			}
			if !registered {
				if err := ensureRegistered(runCtx, client, storedToken.AgentUUID, hostname, logger); err != nil {
					if isAuthError(err) {
						revokeAndReset()
						continue
					}
				} else {
					registered = true
				}
			}
			status, err := sendHeartbeat(runCtx, client, storedToken.AgentUUID, hostname, logger)
			if err != nil {
				if isAuthError(err) {
					revokeAndReset()
					continue
				}
				logger.Warn("heartbeat failed: %v", err)
				continue
			}
			if status == "device_mismatch" {
				devices, err := buildDevicePayloads(ctx, hostname)
				if err != nil {
					logger.Warn("sync build failed: %v", err)
					continue
				}
				var syncErr error
				pending, syncErr = syncWithQueue(ctx, client, logger, pending, devices, true)
				if syncErr != nil && isAuthError(syncErr) {
					revokeAndReset()
					continue
				}
			}
		case <-syncTicker.C:
			if storedToken == nil {
				continue
			}
			if !registered {
				if err := ensureRegistered(runCtx, client, storedToken.AgentUUID, hostname, logger); err != nil {
					if isAuthError(err) {
						revokeAndReset()
						continue
					}
					continue
				}
				registered = true
			}
			devices, err := buildDevicePayloads(ctx, hostname)
			if err != nil {
				logger.Warn("sync build failed: %v", err)
				continue
			}

			var syncErr error
			pending, syncErr = syncWithQueue(ctx, client, logger, pending, devices, true)
			if syncErr != nil {
				if isAuthError(syncErr) {
					revokeAndReset()
					continue
				}
			}
		case <-networkTicker.C:
			if storedToken == nil {
				continue
			}
			if !registered {
				if err := ensureRegistered(runCtx, client, storedToken.AgentUUID, hostname, logger); err != nil {
					if isAuthError(err) {
						revokeAndReset()
						continue
					}
					continue
				}
				registered = true
			}
			devices, hash, err := buildDevicePayloadsWithHash(ctx, hostname)
			if err != nil {
				logger.Warn("network check failed: %v", err)
				continue
			}
			if hash != lastHash {
				lastHash = hash
				var syncErr error
				pending, syncErr = syncWithQueue(ctx, client, logger, pending, devices, true)
				if syncErr != nil {
					if isAuthError(syncErr) {
						revokeAndReset()
						continue
					}
				}
			}
		}
	}
}

func (a *App) loadConfig() (*config.Config, string, error) {
	cfg, configPath, err := config.Load(a.configPath)
	if err != nil {
		return nil, "", err
	}

	if a.serverURL != "" {
		cfg.ServerURL = a.serverURL
	}

	if a.verbose {
		cfg.LogLevel = logging.LevelDebug
	}

	return cfg, configPath, nil
}

func (a *App) startControlServer(serverURL string, logPath string, syncIntervalSeconds int, stopFn func()) error {
	if a.control != nil {
		return nil
	}
	server, err := control.NewServer(control.DefaultAddress, serverURL, logPath, syncIntervalSeconds, a.state, stopFn, a.signalSyncNow)
	if err != nil {
		return err
	}
	if err := server.Start(); err != nil {
		return err
	}
	a.control = server
	return nil
}

func (a *App) stopControlServer() {
	if a.control == nil {
		return
	}
	_ = a.control.Shutdown(context.Background())
	a.control = nil
}

func (a *App) signalSyncNow() {
	if a.syncNow == nil {
		return
	}
	select {
	case a.syncNow <- struct{}{}:
	default:
	}
}

func (a *App) linkDevice(ctx context.Context) error {
	cfg, _, err := a.loadConfig()
	if err != nil {
		return err
	}

	hostname, macAddress, err := deviceIdentity(ctx)
	if err != nil {
		return err
	}

	client := api.NewClient(cfg.ServerURL, "")
	resp, err := client.RequestDeviceCode(ctx, hostname, macAddress)
	if err != nil {
		return err
	}

	a.state.Set(state.StateAwaitingCode)
	fmt.Printf("Visit: %s\n", resp.VerificationURI)
	fmt.Printf("Enter code: %s\n", resp.UserCode)

	a.state.Set(state.StatePolling)
	tokenResp, err := pollForToken(ctx, client, resp.DeviceCode, resp.Interval, resp.ExpiresIn)
	if err != nil {
		a.state.Set(state.StateIdle)
		return err
	}

	if tokenResp.AccessToken == "" || tokenResp.AgentUUID == "" {
		return fmt.Errorf("device flow did not return token")
	}

	if err := token.Save(token.StoredToken{
		AccessToken: tokenResp.AccessToken,
		AgentUUID:   tokenResp.AgentUUID,
		ObtainedAt:  time.Now().UTC(),
	}); err != nil {
		return err
	}

	a.state.Set(state.StateAuthorized)
	authClient := api.NewClient(cfg.ServerURL, tokenResp.AccessToken)
	if err := registerAgent(ctx, authClient, tokenResp.AgentUUID, hostname); err != nil && !isConflictError(err) {
		return err
	}
	devices, err := buildDevicePayloads(ctx, hostname)
	if err != nil {
		return err
	}
	if _, err := authClient.SyncDevices(ctx, devices); err != nil {
		return err
	}
	return nil
}

func (a *App) unlinkDevice() error {
	if err := token.Clear(); err != nil {
		return err
	}
	a.state.Set(state.StateIdle)
	return nil
}

func (a *App) showStatus() error {
	stored, err := token.Load()
	if err != nil {
		return err
	}
	if stored == nil {
		fmt.Printf("status: %s\n", a.state.Get())
		return nil
	}

	fmt.Printf("status: %s\nagent uuid: %s\nobtained at: %s\n", a.state.Get(), stored.AgentUUID, stored.ObtainedAt.Format(time.RFC3339))
	return nil
}

type serviceRunner struct {
	app *App
}

func (s *serviceRunner) Run(ctx context.Context) error {
	return s.app.run(ctx)
}

func newLogger(cfg *config.Config, verbose bool) (*logging.Logger, io.Closer, error) {
	var writer io.Writer = os.Stdout
	var closer io.Closer = nopCloser{}

	if cfg.LogFile != "" {
		if err := ensureLogDir(cfg.LogFile); err != nil {
			return nil, nil, err
		}
		file, err := os.OpenFile(cfg.LogFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			return nil, nil, fmt.Errorf("open log file: %w", err)
		}
		writer = file
		closer = file
	}

	level := cfg.LogLevel
	if verbose {
		level = logging.LevelDebug
	}

	return logging.New(level, writer), closer, nil
}

func ensureLogDir(path string) error {
	dir := filepath.Dir(path)
	if dir == "." {
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}

func sendHeartbeat(ctx context.Context, client *api.Client, agentUUID string, hostname string, logger *logging.Logger) (string, error) {
	primary, err := currentPrimaryAdapter(ctx)
	if err != nil {
		return "", err
	}

	request := api.HeartbeatRequest{
		AgentUUID:  agentUUID,
		Hostname:   hostname,
		MACAddress: primary.MACAddress,
		IPAddress:  primary.IPv4Address,
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	}

	logger.Info("sending heartbeat for agent %s", agentUUID)
	resp, err := client.Heartbeat(ctx, request)
	if err != nil {
		return "", fmt.Errorf("heartbeat failed: %w", err)
	}
	logger.Info("heartbeat status %s", resp.Status)
	return resp.Status, nil
}

func buildDevicePayloads(ctx context.Context, hostname string) ([]api.Device, error) {
	devices, _, err := buildDevicePayloadsWithHash(ctx, hostname)
	return devices, err
}

func buildDevicePayloadsWithHash(ctx context.Context, hostname string) ([]api.Device, string, error) {
	adapterList, err := adapters.Discover(ctx)
	if err != nil {
		return nil, "", err
	}

	primary, err := adapters.Primary(adapterList)
	if err != nil {
		return nil, "", err
	}

	device := api.Device{
		Name:       hostname,
		MACAddress: primary.MACAddress,
		Status:     "online",
		IPAddress:  primary.IPv4Address,
		Adapters:   buildAdapterPayloads(adapterList),
	}

	return []api.Device{device}, adapters.Hash(adapterList), nil
}

func syncWithQueue(ctx context.Context, client *api.Client, logger *logging.Logger, pending []api.Device, current []api.Device, hasCurrent bool) ([]api.Device, error) {
	if len(pending) > 0 {
		if err := syncDevices(ctx, client, logger, pending); err != nil {
			return pending, err
		}
		pending = nil
	}

	if hasCurrent {
		if err := syncDevices(ctx, client, logger, current); err != nil {
			return current, err
		}
	}

	return nil, nil
}

func syncDevices(ctx context.Context, client *api.Client, logger *logging.Logger, devices []api.Device) error {
	resp, err := client.SyncDevices(ctx, devices)
	if err != nil {
		logger.Error("sync failed: %v", err)
		return err
	}

	logger.Info("sync complete synced=%d", resp.Synced)
	return nil
}

func normalizeAdapterType(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch normalized {
	case "ethernet":
		return "ethernet"
	case "wireless", "wi-fi", "wifi":
		return "wifi"
	case "vpn":
		return "vpn"
	case "virtual":
		return "virtual"
	case "loopback":
		return "loopback"
	case "bluetooth", "unknown", "":
		return "other"
	default:
		return "other"
	}
}

func registerAgent(ctx context.Context, client *api.Client, agentUUID string, hostname string) error {
	primary, err := currentPrimaryAdapter(ctx)
	if err != nil {
		return err
	}

	request := api.RegisterRequest{
		AgentUUID:  agentUUID,
		Hostname:   hostname,
		MACAddress: primary.MACAddress,
		IPAddress:  primary.IPv4Address,
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	}

	if err := client.Register(ctx, request); err != nil {
		return err
	}

	return nil
}

func ensureRegistered(ctx context.Context, client *api.Client, agentUUID string, hostname string, logger *logging.Logger) error {
	if err := registerAgent(ctx, client, agentUUID, hostname); err != nil {
		if isAuthError(err) {
			return err
		}
		if isConflictError(err) {
			logger.Info("agent already registered")
			return nil
		}
		logger.Warn("registration failed: %v", err)
		return err
	}
	return nil
}

func currentPrimaryAdapter(ctx context.Context) (*adapters.Adapter, error) {
	adapterList, err := adapters.Discover(ctx)
	if err != nil {
		return nil, err
	}

	primary, err := adapters.Primary(adapterList)
	if err != nil {
		return nil, err
	}

	return primary, nil
}

func buildAdapterPayloads(adapterList []adapters.Adapter) []api.AdapterPayload {
	payloads := make([]api.AdapterPayload, 0, len(adapterList))
	for _, adapter := range adapterList {
		payloads = append(payloads, api.AdapterPayload{
			Name:           adapter.Name,
			Description:    adapter.Description,
			Type:           normalizeAdapterType(adapter.Type),
			MACAddress:     adapter.MACAddress,
			Connected:      adapter.Connected,
			DHCPEnabled:    adapter.DHCPEnabled,
			IPv4Address:    adapter.IPv4Address,
			SubnetMask:     adapter.SubnetMask,
			DefaultGateway: adapter.DefaultGateway,
			DHCPServer:     adapter.DHCPServer,
			DNSServers:     adapter.DNSServers,
		})
	}
	return payloads
}

func isAuthError(err error) bool {
	var apiErr *api.APIError
	if err == nil {
		return false
	}
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode == http.StatusUnauthorized
	}
	return false
}

func apiErrorStatus(err error) (int, bool) {
	var apiErr *api.APIError
	if err == nil {
		return 0, false
	}
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode, true
	}
	return 0, false
}

func isConflictError(err error) bool {
	var apiErr *api.APIError
	if err == nil {
		return false
	}
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode == http.StatusConflict
	}
	return false
}

func (a *App) handleAuthRevoked() error {
	a.state.Set(state.StateDisconnected)
	if err := token.Clear(); err != nil {
		return err
	}
	return fmt.Errorf("device disconnected, re-link required")
}

func withSignalContext() context.Context {
	ctx, _ := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	return ctx
}

type nopCloser struct{}

func (nopCloser) Close() error { return nil }

func deviceIdentity(ctx context.Context) (string, string, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return "", "", fmt.Errorf("read hostname: %w", err)
	}

	adapterList, err := adapters.Discover(ctx)
	if err != nil {
		return "", "", err
	}

	primary, err := adapters.Primary(adapterList)
	if err != nil {
		return "", "", err
	}

	if primary.MACAddress == "" {
		return hostname, "", fmt.Errorf("no suitable network interface found")
	}

	return hostname, primary.MACAddress, nil
}

func pollForToken(ctx context.Context, client *api.Client, deviceCode string, intervalSeconds int, expiresIn int) (*api.DeviceTokenResponse, error) {
	if intervalSeconds <= 0 {
		intervalSeconds = 5
	}

	pollInterval := time.Duration(intervalSeconds) * time.Second
	expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)

	for time.Now().Before(expiresAt) {
		if err := sleepUntil(ctx, pollInterval); err != nil {
			return nil, err
		}

		resp, _, err := client.RequestDeviceToken(ctx, deviceCode)
		if err != nil {
			return nil, err
		}

		switch resp.Error {
		case "":
			return resp, nil
		case "authorization_pending":
			continue
		case "slow_down":
			pollInterval += 5 * time.Second
			continue
		case "expired_token":
			return nil, fmt.Errorf("device flow expired")
		case "access_denied":
			return nil, fmt.Errorf("device flow denied")
		default:
			return nil, fmt.Errorf("device flow error: %s", resp.Error)
		}
	}

	return nil, fmt.Errorf("device flow timed out")
}

func sleepUntil(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
