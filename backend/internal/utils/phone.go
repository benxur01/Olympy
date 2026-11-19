package utils

import (
	"regexp"
	"strings"
)

var digitsOnlyRegex = regexp.MustCompile(`\D`)

// NormalizePhone normalizes phone to E.164 standard (e.g. +998901234567)
func NormalizePhone(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "google_") {
		return raw
	}

	digits := digitsOnlyRegex.ReplaceAllString(raw, "")
	if digits == "" {
		return ""
	}

	if strings.HasPrefix(raw, "+") {
		if len(digits) >= 8 && len(digits) <= 15 {
			return "+" + digits
		}
		return ""
	}

	// Uzbek numbers
	if strings.HasPrefix(digits, "998") && len(digits) == 12 {
		return "+" + digits
	}
	if len(digits) == 9 {
		return "+998" + digits
	}

	if len(digits) >= 8 && len(digits) <= 15 {
		return "+" + digits
	}

	return ""
}
