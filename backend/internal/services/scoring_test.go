package services

import "testing"

func TestScoringCalculations(t *testing.T) {
	// Percentage
	p := CalculatePercentage(75, 100)
	if p != 75.0 {
		t.Errorf("Expected 75.0, got %f", p)
	}

	p2 := CalculatePercentage(1, 3)
	if p2 != 33.33 {
		t.Errorf("Expected 33.33, got %f", p2)
	}

	// CEFR levels
	cefrTests := []struct {
		percentage float64
		expected   string
	}{
		{98.0, "C2"},
		{88.0, "C1"},
		{75.0, "B2"},
		{60.0, "B1"},
		{45.0, "A2"},
		{20.0, "A1"},
	}

	for _, tt := range cefrTests {
		got := CalculateCEFRLevel(tt.percentage)
		if got != tt.expected {
			t.Errorf("CalculateCEFRLevel(%f) = %s; expected %s", tt.percentage, got, tt.expected)
		}
	}

	// IELTS band
	band := CalculateIELTSBand(85.0)
	if band != 8.0 {
		t.Errorf("Expected 8.0 band for 85%%, got %f", band)
	}
}
