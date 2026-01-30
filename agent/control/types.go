package control

import "time"

// StatusResponse describes the current agent status.
type StatusResponse struct {
	State      string `json:"state"`
	Linked     bool   `json:"linked"`
	AgentUUID  string `json:"agentUuid,omitempty"`
	ObtainedAt string `json:"obtainedAt,omitempty"`
	Message    string `json:"message,omitempty"`
}

// LinkStartResponse is returned when device flow starts.
type LinkStartResponse struct {
	VerificationURI string `json:"verificationUri"`
	UserCode        string `json:"userCode"`
	ExpiresIn       int    `json:"expiresIn"`
	Interval        int    `json:"interval"`
}

// LinkStatusResponse is returned for device flow polling.
type LinkStatusResponse struct {
	Status  string `json:"status"`
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

// NetworkResponse contains adapter details for the local machine.
type NetworkResponse struct {
	Primary  *AdapterInfo  `json:"primary,omitempty"`
	Adapters []AdapterInfo `json:"adapters"`
}

// AdapterInfo provides UI-friendly adapter metadata.
type AdapterInfo struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Type           string   `json:"type"`
	MACAddress     string   `json:"macAddress"`
	Connected      bool     `json:"connected"`
	DHCPEnabled    bool     `json:"dhcpEnabled"`
	IPv4Address    string   `json:"ipv4Address,omitempty"`
	SubnetMask     string   `json:"subnetMask,omitempty"`
	DefaultGateway string   `json:"defaultGateway,omitempty"`
	DHCPServer     string   `json:"dhcpServer,omitempty"`
	DNSServers     []string `json:"dnsServers,omitempty"`
}

type pendingLink struct {
	deviceCode string
	interval   int
	expiresAt  time.Time
}

