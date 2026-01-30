package config

// AutoStartEnabled returns the resolved auto_start setting.
func (c *Config) AutoStartEnabled() bool {
	if c.AutoStart == nil {
		return true
	}
	return *c.AutoStart
}
