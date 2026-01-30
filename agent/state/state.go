package state

import "sync"

// State represents the agent lifecycle state.
type State string

const (
	StateIdle         State = "idle"
	StateAwaitingCode State = "awaiting_code"
	StatePolling      State = "polling"
	StateAuthorized   State = "authorized"
	StateRunning      State = "running"
	StateDisconnected State = "disconnected"
	StateStopped      State = "stopped"
)

// Machine tracks the current agent state.
type Machine struct {
	mu      sync.Mutex
	current State
}

// New creates a new state machine in IDLE state.
func New() *Machine {
	return &Machine{
		current: StateIdle,
	}
}

// Set updates the current state.
func (m *Machine) Set(state State) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.current = state
}

// Get returns the current state.
func (m *Machine) Get() State {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.current
}
