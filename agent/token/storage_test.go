package token

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTokenSaveLoadClear(t *testing.T) {
	tempDir := t.TempDir()
	originalAppData := os.Getenv("APPDATA")
	if err := os.Setenv("APPDATA", tempDir); err != nil {
		t.Fatalf("set APPDATA: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Setenv("APPDATA", originalAppData)
	})

	now := time.Now().UTC().Truncate(time.Second)
	input := StoredToken{
		AccessToken: "token-123",
		AgentUUID:   "agent-uuid",
		ObtainedAt:  now,
	}

	if err := Save(input); err != nil {
		t.Fatalf("save token: %v", err)
	}

	path, err := Path()
	if err != nil {
		t.Fatalf("path: %v", err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected token file: %v", err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatalf("load token: %v", err)
	}
	if loaded == nil || loaded.AccessToken != input.AccessToken || loaded.AgentUUID != input.AgentUUID {
		t.Fatalf("unexpected token data")
	}

	if err := Clear(); err != nil {
		t.Fatalf("clear token: %v", err)
	}

	if _, err := os.Stat(filepath.Join(tempDir, "NetworkCloud", tokenFileName)); !os.IsNotExist(err) {
		t.Fatalf("expected token file to be removed")
	}
}
