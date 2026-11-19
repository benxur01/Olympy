package utils

import "testing"

func TestPasswordHashing(t *testing.T) {
	password := "Secret123!"
	hashed, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if !CheckPasswordHash(password, hashed) {
		t.Errorf("CheckPasswordHash failed for correct password")
	}

	if CheckPasswordHash("WrongPassword", hashed) {
		t.Errorf("CheckPasswordHash returned true for wrong password")
	}
}

func TestJWTGenerationAndValidation(t *testing.T) {
	secret := "test-secret-key-123"
	access, refresh, err := GenerateTokens(42, "+998901234567", []string{"student"}, false, secret)
	if err != nil {
		t.Fatalf("GenerateTokens failed: %v", err)
	}

	if access == "" || refresh == "" {
		t.Errorf("Expected non-empty tokens")
	}

	claims, err := ValidateToken(access, secret)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != 42 {
		t.Errorf("Expected UserID 42, got %d", claims.UserID)
	}

	if claims.Phone != "+998901234567" {
		t.Errorf("Expected phone +998901234567, got %s", claims.Phone)
	}

	// Validate with wrong secret should fail
	_, err = ValidateToken(access, "wrong-secret")
	if err == nil {
		t.Errorf("Expected error when validating with wrong secret")
	}
}
