package logging

import (
	"io"
	"log"
	"strings"
)

const (
	LevelDebug = "debug"
	LevelInfo  = "info"
	LevelWarn  = "warn"
	LevelError = "error"
)

var levelOrder = map[string]int{
	LevelDebug: 0,
	LevelInfo:  1,
	LevelWarn:  2,
	LevelError: 3,
}

// Logger provides leveled logging.
type Logger struct {
	level  int
	logger *log.Logger
}

// New creates a new Logger with the specified minimum level.
func New(level string, out io.Writer) *Logger {
	normalized := strings.ToLower(level)
	priority, ok := levelOrder[normalized]
	if !ok {
		priority = levelOrder[LevelInfo]
	}

	return &Logger{
		level:  priority,
		logger: log.New(out, "", log.LstdFlags),
	}
}

// Debug logs debug messages.
func (l *Logger) Debug(format string, args ...any) {
	l.log(LevelDebug, format, args...)
}

// Info logs informational messages.
func (l *Logger) Info(format string, args ...any) {
	l.log(LevelInfo, format, args...)
}

// Warn logs warning messages.
func (l *Logger) Warn(format string, args ...any) {
	l.log(LevelWarn, format, args...)
}

// Error logs error messages.
func (l *Logger) Error(format string, args ...any) {
	l.log(LevelError, format, args...)
}

func (l *Logger) log(level string, format string, args ...any) {
	priority, ok := levelOrder[level]
	if !ok {
		priority = levelOrder[LevelInfo]
	}

	if priority < l.level {
		return
	}

	prefix := strings.ToUpper(level)
	l.logger.Printf(prefix+": "+format, args...)
}
