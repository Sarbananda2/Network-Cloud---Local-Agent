package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestDeviceTokenHandlesPending(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/device/token" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"authorization_pending"}`))
	}))
	t.Cleanup(server.Close)

	client := NewClient(server.URL, "")
	resp, status, err := client.RequestDeviceToken(context.Background(), "code")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status != http.StatusBadRequest {
		t.Fatalf("unexpected status: %d", status)
	}
	if resp.Error != "authorization_pending" {
		t.Fatalf("unexpected error value: %s", resp.Error)
	}
}

func TestRequestDeviceCodeSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/device/authorize" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"device_code":"device","user_code":"CODE","verification_uri":"https://example.com/device","expires_in":60,"interval":5}`))
	}))
	t.Cleanup(server.Close)

	client := NewClient(server.URL, "")
	resp, err := client.RequestDeviceCode(context.Background(), "host", "AA:BB:CC:DD:EE:FF")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.DeviceCode == "" || resp.UserCode == "" || resp.VerificationURI == "" {
		t.Fatalf("unexpected response: %+v", resp)
	}
}
