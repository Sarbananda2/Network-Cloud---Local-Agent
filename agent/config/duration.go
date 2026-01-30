package config

import (
	"fmt"
	"time"

	"gopkg.in/yaml.v3"
)

// DurationSeconds represents a duration stored in seconds in YAML.
type DurationSeconds time.Duration

// Duration returns the time.Duration value.
func (d DurationSeconds) Duration() time.Duration {
	return time.Duration(d) * time.Second
}

// UnmarshalYAML parses either a number of seconds or a duration string.
func (d *DurationSeconds) UnmarshalYAML(value *yaml.Node) error {
	if value.Kind == yaml.ScalarNode {
		if value.Tag == "!!int" {
			var seconds int
			if err := value.Decode(&seconds); err != nil {
				return fmt.Errorf("decode seconds: %w", err)
			}
			*d = DurationSeconds(seconds)
			return nil
		}
		if value.Tag == "!!str" {
			var text string
			if err := value.Decode(&text); err != nil {
				return fmt.Errorf("decode duration string: %w", err)
			}
			parsed, err := time.ParseDuration(text)
			if err != nil {
				return fmt.Errorf("parse duration: %w", err)
			}
			*d = DurationSeconds(parsed / time.Second)
			return nil
		}
	}

	return fmt.Errorf("duration must be seconds or duration string")
}
