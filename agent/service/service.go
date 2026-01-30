package service

import (
	"context"
	"fmt"

	"github.com/kardianos/service"
)

const (
	ServiceName        = "NetworkCloudAgent"
	ServiceDisplayName = "NetworkCloud Agent"
	ServiceDescription = "Monitors local network and reports devices to NetworkCloud"
)

// Runner defines the application lifecycle used by the service.
type Runner interface {
	Run(ctx context.Context) error
}

// Program wraps the service runner to integrate with the service manager.
type Program struct {
	runner Runner
	cancel context.CancelFunc
	done   chan struct{}
}

// NewProgram creates a new service program.
func NewProgram(runner Runner) *Program {
	return &Program{
		runner: runner,
		done:   make(chan struct{}),
	}
}

// Start begins the service runtime.
func (p *Program) Start(_ service.Service) error {
	if p.runner == nil {
		return fmt.Errorf("runner is required")
	}

	if p.cancel != nil {
		return fmt.Errorf("service already running")
	}

	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel

	go func() {
		_ = p.runner.Run(ctx)
		close(p.done)
	}()

	return nil
}

// Stop signals the service to stop and waits for completion.
func (p *Program) Stop(_ service.Service) error {
	if p.cancel == nil {
		return nil
	}

	p.cancel()
	<-p.done
	p.cancel = nil
	return nil
}

// NewService creates a Windows service instance for the agent.
func NewService(program *Program) (service.Service, error) {
	config := &service.Config{
		Name:        ServiceName,
		DisplayName: ServiceDisplayName,
		Description: ServiceDescription,
	}

	return service.New(program, config)
}
