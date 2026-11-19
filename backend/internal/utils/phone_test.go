package utils

import "testing"

func TestNormalizePhone(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"+998901234567", "+998901234567"},
		{"901234567", "+998901234567"},
		{"998901234567", "+998901234567"},
		{"+998 (90) 123-45-67", "+998901234567"},
		{"90 123 45 67", "+998901234567"},
		{"+14155552671", "+14155552671"},
		{"", ""},
		{"abc", ""},
	}

	for _, tt := range tests {
		got := NormalizePhone(tt.input)
		if got != tt.expected {
			t.Errorf("NormalizePhone(%q) = %q; expected %q", tt.input, got, tt.expected)
		}
	}
}
