package scanner

import (
	"context"
	"fmt"
	"io"
	"net"
	"os/exec"
	"strings"
	"sync"
	"time"
)

const (
	MaxPingConcurrency = 100
	PingTimeout        = 1 * time.Second
)

// Device represents a discovered network device.
type Device struct {
	IPAddress  string
	MACAddress string
	Hostname   string
	Status     string
}

// Scan discovers devices on the local network using ping and ARP.
func Scan(ctx context.Context, ifaceName string, timeout time.Duration) ([]Device, error) {
	if timeout <= 0 {
		return nil, fmt.Errorf("timeout must be greater than 0")
	}

	iface, ipAddr, ipNet, err := selectInterface(ifaceName)
	if err != nil {
		return nil, err
	}

	_ = iface

	scanCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	if err := pingSweep(scanCtx, ipAddr, ipNet); err != nil {
		return nil, err
	}

	entries, err := readARPTable()
	if err != nil {
		return nil, err
	}

	devices := make([]Device, 0, len(entries))
	for _, entry := range entries {
		if !ipNet.Contains(entry.IP) {
			continue
		}

		hostname := resolveHostname(entry.IP.String())
		devices = append(devices, Device{
			IPAddress:  entry.IP.String(),
			MACAddress: normalizeMAC(entry.MAC),
			Hostname:   hostname,
			Status:     "online",
		})
	}

	return devices, nil
}

func selectInterface(ifaceName string) (*net.Interface, net.IP, *net.IPNet, error) {
	if ifaceName != "" {
		iface, err := net.InterfaceByName(ifaceName)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("find interface: %w", err)
		}

		ipAddr, ipNet, err := interfaceIPv4(iface)
		if err != nil {
			return nil, nil, nil, err
		}

		return iface, ipAddr, ipNet, nil
	}

	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("list interfaces: %w", err)
	}

	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		ipAddr, ipNet, err := interfaceIPv4(&iface)
		if err != nil {
			continue
		}

		return &iface, ipAddr, ipNet, nil
	}

	return nil, nil, nil, fmt.Errorf("no suitable network interface found")
}

func interfaceIPv4(iface *net.Interface) (net.IP, *net.IPNet, error) {
	addrs, err := iface.Addrs()
	if err != nil {
		return nil, nil, fmt.Errorf("read interface addresses: %w", err)
	}

	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		if !ok {
			continue
		}
		ip := ipNet.IP.To4()
		if ip == nil {
			continue
		}
		return ip, ipNet, nil
	}

	return nil, nil, fmt.Errorf("no ipv4 address found for interface %s", iface.Name)
}

func pingSweep(ctx context.Context, localIP net.IP, ipNet *net.IPNet) error {
	jobs := make(chan string)
	wg := sync.WaitGroup{}

	for i := 0; i < MaxPingConcurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ip := range jobs {
				_ = pingHost(ctx, ip)
			}
		}()
	}

	for ip := networkIP(ipNet); ipNet.Contains(ip); ip = nextIP(ip) {
		if ctx.Err() != nil {
			break
		}

		if shouldSkipIP(ip, localIP, ipNet) {
			continue
		}

		select {
		case jobs <- ip.String():
		case <-ctx.Done():
			break
		}
	}

	close(jobs)
	wg.Wait()

	return nil
}

func pingHost(ctx context.Context, ip string) error {
	cmd := exec.CommandContext(ctx, "ping", "-n", "1", "-w", fmt.Sprintf("%d", PingTimeout.Milliseconds()), ip)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	return cmd.Run()
}

type arpEntry struct {
	IP  net.IP
	MAC string
}

func readARPTable() ([]arpEntry, error) {
	cmd := exec.Command("arp", "-a")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("read arp table: %w", err)
	}

	return parseARPOutput(string(output)), nil
}

func parseARPOutput(output string) []arpEntry {
	lines := strings.Split(output, "\n")
	entries := make([]arpEntry, 0, len(lines))

	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		ip := net.ParseIP(fields[0])
		if ip == nil {
			continue
		}

		mac := fields[1]
		if mac == "" || isBroadcastMAC(mac) {
			continue
		}

		entries = append(entries, arpEntry{
			IP:  ip,
			MAC: mac,
		})
	}

	return entries
}

func isBroadcastMAC(mac string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(mac, "-", ":"))
	return normalized == "ff:ff:ff:ff:ff:ff"
}

func normalizeMAC(mac string) string {
	normalized := strings.ReplaceAll(mac, "-", ":")
	normalized = strings.ToUpper(normalized)
	return normalized
}

func resolveHostname(ip string) string {
	names, err := net.LookupAddr(ip)
	if err != nil || len(names) == 0 {
		return "Unknown"
	}

	return strings.TrimSuffix(names[0], ".")
}

func networkIP(ipNet *net.IPNet) net.IP {
	network := ipNet.IP.Mask(ipNet.Mask)
	return append(net.IP(nil), network...)
}

func nextIP(ip net.IP) net.IP {
	next := append(net.IP(nil), ip...)
	for i := len(next) - 1; i >= 0; i-- {
		next[i]++
		if next[i] != 0 {
			break
		}
	}
	return next
}

func shouldSkipIP(ip net.IP, localIP net.IP, ipNet *net.IPNet) bool {
	if ip.Equal(localIP) {
		return true
	}

	network := networkIP(ipNet)
	if ip.Equal(network) {
		return true
	}

	broadcast := broadcastIP(ipNet)
	return ip.Equal(broadcast)
}

func broadcastIP(ipNet *net.IPNet) net.IP {
	ip := networkIP(ipNet)
	broadcast := append(net.IP(nil), ip...)
	for i := range broadcast {
		broadcast[i] |= ^ipNet.Mask[i]
	}
	return broadcast
}
