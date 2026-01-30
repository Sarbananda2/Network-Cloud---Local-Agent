package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadAppliesDefaults(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "agent.yaml")
	if err := os.WriteFile(configPath, []byte("server_url: \"https://example.com\"\n"), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, _, err := Load(configPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.HeartbeatInterval.Duration().Seconds() != DefaultHeartbeatSeconds {
		t.Fatalf("unexpected heartbeat interval: %v", cfg.HeartbeatInterval)
	}
	if cfg.SyncInterval.Duration().Seconds() != DefaultSyncSeconds {
		t.Fatalf("unexpected sync interval: %v", cfg.SyncInterval)
	}
	if cfg.NetworkCheckInterval.Duration().Seconds() != DefaultNetworkCheckSeconds {
		t.Fatalf("unexpected network check interval: %v", cfg.NetworkCheckInterval)
	}
	if cfg.LogLevel != DefaultLogLevel {
		t.Fatalf("unexpected log level: %s", cfg.LogLevel)
	}
	if cfg.AutoStartEnabled() != true {
		t.Fatalf("expected auto start to be true")
	}
}

func TestLoadRejectsNonHTTPS(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "agent.yaml")
	if err := os.WriteFile(configPath, []byte("server_url: \"http://example.com\"\n"), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	_, _, err := Load(configPath)
	if err == nil {
		t.Fatalf("expected error for non-https server_url")
	}
}

func TestAutoStartFalse(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "agent.yaml")
	content := "server_url: \"https://example.com\"\nauto_start: false\n"
	if err := os.WriteFile(configPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, _, err := Load(configPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.AutoStartEnabled() != false {
		t.Fatalf("expected auto start to be false")
	}
}
