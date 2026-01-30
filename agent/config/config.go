package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	DefaultHeartbeatSeconds    = 30
	DefaultSyncSeconds         = 300
	DefaultNetworkCheckSeconds = 60
	DefaultLogLevel            = "info"
)

// Config defines the agent configuration loaded from YAML.
type Config struct {
	ServerURL            string          `yaml:"server_url"`
	HeartbeatInterval    DurationSeconds `yaml:"heartbeat_interval"`
	SyncInterval         DurationSeconds `yaml:"sync_interval"`
	NetworkCheckInterval DurationSeconds `yaml:"network_check_interval"`
	LogLevel             string          `yaml:"log_level"`
	LogFile              string          `yaml:"log_file"`
	AutoStart            *bool           `yaml:"auto_start"`
}

// Load reads the configuration file from a custom path or default locations.
// It returns the loaded config and the resolved path.
func Load(pathOverride string) (*Config, string, error) {
	paths := candidatePaths(pathOverride)
	resolved, err := firstExistingPath(paths)
	if err != nil {
		return nil, "", err
	}

	data, err := os.ReadFile(resolved)
	if err != nil {
		return nil, "", fmt.Errorf("read config file: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, "", fmt.Errorf("parse config: %w", err)
	}

	applyDefaults(&cfg)
	cfg.ServerURL = strings.TrimRight(cfg.ServerURL, "/")

	if err := validateConfig(&cfg); err != nil {
		return nil, "", err
	}

	return &cfg, resolved, nil
}

func candidatePaths(pathOverride string) []string {
	if pathOverride != "" {
		return []string{pathOverride}
	}

	paths := []string{"agent.yaml"}

	appData := os.Getenv("APPDATA")
	if appData != "" {
		paths = append(paths, filepath.Join(appData, "NetworkCloud", "agent.yaml"))
	}

	return paths
}

func firstExistingPath(paths []string) (string, error) {
	for _, path := range paths {
		if path == "" {
			continue
		}
		if fileExists(path) {
			return path, nil
		}
	}

	return "", fmt.Errorf("config file not found")
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

func applyDefaults(cfg *Config) {
	if cfg.HeartbeatInterval == 0 {
		cfg.HeartbeatInterval = DurationSeconds(DefaultHeartbeatSeconds)
	}

	if cfg.SyncInterval == 0 {
		cfg.SyncInterval = DurationSeconds(DefaultSyncSeconds)
	}

	if cfg.NetworkCheckInterval == 0 {
		cfg.NetworkCheckInterval = DurationSeconds(DefaultNetworkCheckSeconds)
	}

	if cfg.LogLevel == "" {
		cfg.LogLevel = DefaultLogLevel
	}

	if cfg.AutoStart == nil {
		defaultValue := true
		cfg.AutoStart = &defaultValue
	}
}

func validateConfig(cfg *Config) error {
	if cfg.ServerURL == "" {
		return fmt.Errorf("server_url is required")
	}

	parsed, err := url.Parse(cfg.ServerURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("server_url must be a valid https url")
	}
	if parsed.Scheme != "https" {
		return fmt.Errorf("server_url must use https")
	}

	if cfg.HeartbeatInterval <= 0 {
		return fmt.Errorf("heartbeat_interval must be greater than 0")
	}
	if cfg.SyncInterval <= 0 {
		return fmt.Errorf("sync_interval must be greater than 0")
	}
	if cfg.NetworkCheckInterval <= 0 {
		return fmt.Errorf("network_check_interval must be greater than 0")
	}
	if cfg.LogLevel != "" && !isValidLogLevel(cfg.LogLevel) {
		return fmt.Errorf("log_level must be debug, info, warn, or error")
	}

	return nil
}

func isValidLogLevel(level string) bool {
	switch strings.ToLower(level) {
	case "debug", "info", "warn", "error":
		return true
	default:
		return false
	}
}
