package services

import (
	"math"
)

// CalculateCEFRLevel returns standard CEFR level based on percentage (0..100)
func CalculateCEFRLevel(percentage float64) string {
	switch {
	case percentage >= 95:
		return "C2"
	case percentage >= 85:
		return "C1"
	case percentage >= 70:
		return "B2"
	case percentage >= 55:
		return "B1"
	case percentage >= 40:
		return "A2"
	default:
		return "A1"
	}
}

// CalculateIELTSBand maps 0..100 percentage to 0.0 - 9.0 IELTS band scale
func CalculateIELTSBand(percentage float64) float64 {
	switch {
	case percentage >= 95:
		return 9.0
	case percentage >= 90:
		return 8.5
	case percentage >= 85:
		return 8.0
	case percentage >= 80:
		return 7.5
	case percentage >= 75:
		return 7.0
	case percentage >= 70:
		return 6.5
	case percentage >= 60:
		return 6.0
	case percentage >= 50:
		return 5.5
	case percentage >= 40:
		return 5.0
	case percentage >= 30:
		return 4.5
	case percentage >= 20:
		return 4.0
	default:
		return 3.5
	}
}

// CalculatePercentage computes rounded percentage
func CalculatePercentage(earned, maxScore int) float64 {
	if maxScore <= 0 {
		return 0.0
	}
	raw := (float64(earned) / float64(maxScore)) * 100.0
	return math.Round(raw*100) / 100
}
