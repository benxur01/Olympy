package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"olympy-backend-go/internal/config"
	"olympy-backend-go/internal/database"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func setupTestApp(t *testing.T) (*gin.Engine, *config.Config) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dbPath := filepath.Join(t.TempDir(), "test.db")
	cfg := &config.Config{
		Port:           "8000",
		DBEngine:       "sqlite",
		DBName:         dbPath,
		JWTSecret:      "unit-test-jwt-secret-key",
		AllowedOrigins: "http://localhost:5173",
	}

	if _, err := database.InitTestDB(dbPath); err != nil {
		t.Fatalf("InitTestDB failed: %v", err)
	}
	database.SeedDatabase(database.DB)

	router := SetupRouter(cfg)
	return router, cfg
}

func performJSON(router *gin.Engine, method, path string, body interface{}, token string) *httptest.ResponseRecorder {
	var reqBody *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reqBody = bytes.NewReader(b)
	} else {
		reqBody = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reqBody)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func loginTestUser(t *testing.T, router *gin.Engine, phone, password string) (string, string, map[string]interface{}) {
	t.Helper()
	resp := performJSON(router, http.MethodPost, "/api/auth/login/", map[string]string{
		"phone":    phone,
		"password": password,
	}, "")
	if resp.Code != http.StatusOK {
		t.Fatalf("login(%s) expected 200, got %d: %s", phone, resp.Code, resp.Body.String())
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(resp.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal login response failed: %v", err)
	}
	access, _ := payload["token"].(string)
	refresh, _ := payload["refresh"].(string)
	user, _ := payload["user"].(map[string]interface{})
	if access == "" || refresh == "" {
		t.Fatalf("expected non-empty access and refresh tokens")
	}
	return access, refresh, user
}

func TestHealthAndCORSPreflight(t *testing.T) {
	router, _ := setupTestApp(t)

	healthResp := performJSON(router, http.MethodGet, "/api/health/", nil, "")
	if healthResp.Code != http.StatusOK {
		t.Fatalf("expected 200 on health, got %d", healthResp.Code)
	}

	req := httptest.NewRequest(http.MethodOptions, "/api/auth/login/", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "Authorization, Content-Type, X-Olympy-Auth-Storage")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent && w.Code != http.StatusOK {
		t.Fatalf("expected 204/200 on preflight, got %d", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("expected Access-Control-Allow-Origin http://localhost:5173, got %q", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("expected Access-Control-Allow-Credentials true, got %q", got)
	}
}

func TestAuthTokenSeparationAndRolesDetail(t *testing.T) {
	router, _ := setupTestApp(t)

	access, refresh, user := loginTestUser(t, router, "+998901112233", "teacher123")
	rolesDetail, ok := user["roles_detail"].(map[string]interface{})
	if !ok || rolesDetail["teacher"] == nil {
		t.Fatalf("expected roles_detail.teacher in login payload, got %#v", user["roles_detail"])
	}

	// Refresh token must not work as Bearer access token
	badResp := performJSON(router, http.MethodGet, "/api/me/", nil, refresh)
	if badResp.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when using refresh token on /api/me/, got %d", badResp.Code)
	}

	// Valid access token works on /api/me/
	meResp := performJSON(router, http.MethodGet, "/api/me/", nil, access)
	if meResp.Code != http.StatusOK {
		t.Fatalf("expected 200 on /api/me/, got %d: %s", meResp.Code, meResp.Body.String())
	}

	// Refresh endpoint accepts refresh token and returns fresh access token
	refResp := performJSON(router, http.MethodPost, "/api/auth/token/refresh/", map[string]string{
		"refresh": refresh,
	}, "")
	if refResp.Code != http.StatusOK {
		t.Fatalf("expected 200 on /api/auth/token/refresh/, got %d: %s", refResp.Code, refResp.Body.String())
	}
}

func TestStudentCannotAccessAdminOrStaffMutations(t *testing.T) {
	router, _ := setupTestApp(t)

	studentToken, _, _ := loginTestUser(t, router, "+998909998877", "student123")

	forbiddenChecks := []struct {
		method string
		path   string
		body   interface{}
	}{
		{http.MethodPost, "/api/olympiads/", map[string]interface{}{"title": "Unauthorized Olympiad"}},
		{http.MethodPost, "/api/questions/", map[string]interface{}{"text": "Unauthorized Question"}},
		{http.MethodPatch, "/api/centers/1/", map[string]interface{}{"status": "approved", "is_premium": true}},
		{http.MethodPost, "/api/centers/1/approve-teacher/", map[string]interface{}{"user_id": 4}},
		{http.MethodGet, "/api/billing/admin/revenue/", nil},
		{http.MethodGet, "/api/admin/users/", nil},
		{http.MethodPost, "/api/attempts/session/terminate/", map[string]interface{}{"session_id": 1, "reason": "abuse"}},
	}

	for _, tc := range forbiddenChecks {
		resp := performJSON(router, tc.method, tc.path, tc.body, studentToken)
		if resp.Code != http.StatusForbidden {
			t.Errorf("%s %s by student expected 403, got %d (%s)", tc.method, tc.path, resp.Code, resp.Body.String())
		}
	}
}

func TestOlympiadExamFlowAndDuplicateSubmissionGuard(t *testing.T) {
	router, _ := setupTestApp(t)

	studentToken, _, _ := loginTestUser(t, router, "+998909998877", "student123")

	// List olympiads
	listResp := performJSON(router, http.MethodGet, "/api/olympiads/", nil, studentToken)
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected 200 listing olympiads, got %d", listResp.Code)
	}
	var olympiads []map[string]interface{}
	if err := json.Unmarshal(listResp.Body.Bytes(), &olympiads); err != nil || len(olympiads) == 0 {
		t.Fatalf("expected seeded olympiads, got %s", listResp.Body.String())
	}
	olympiadID := int(olympiads[0]["id"].(float64))

	// Fetch paginated question 0
	qResp := performJSON(router, http.MethodGet, fmt.Sprintf("/api/olympiads/%d/questions/?q=0", olympiadID), nil, studentToken)
	if qResp.Code != http.StatusOK {
		t.Fatalf("expected 200 on question 0, got %d: %s", qResp.Code, qResp.Body.String())
	}
	var qPayload map[string]interface{}
	if err := json.Unmarshal(qResp.Body.Bytes(), &qPayload); err != nil {
		t.Fatalf("unmarshal questions failed: %v", err)
	}
	qList, ok := qPayload["questions"].([]interface{})
	if !ok || len(qList) != 1 {
		t.Fatalf("expected 1 paginated question, got %#v", qPayload)
	}
	firstQ := qList[0].(map[string]interface{})
	qIDStr := fmt.Sprintf("%d", int(firstQ["id"].(float64)))

	// Submit exam answers (map keyed by question ID)
	submitBody := map[string]interface{}{
		"olympiad":   olympiadID,
		"answers":    map[string]interface{}{qIDStr: 1},
		"time_spent": 45,
	}
	submitResp := performJSON(router, http.MethodPost, "/api/attempts/", submitBody, studentToken)
	if submitResp.Code != http.StatusCreated {
		t.Fatalf("expected 201 submitting attempt, got %d: %s", submitResp.Code, submitResp.Body.String())
	}
	var submitData map[string]interface{}
	_ = json.Unmarshal(submitResp.Body.Bytes(), &submitData)
	certUUID, _ := submitData["certificate_uuid"].(string)
	attemptID := int(submitData["id"].(float64))

	// Duplicate submission must return 409 Conflict
	dupResp := performJSON(router, http.MethodPost, "/api/attempts/", submitBody, studentToken)
	if dupResp.Code != http.StatusConflict {
		t.Fatalf("expected 409 on duplicate attempt submission, got %d", dupResp.Code)
	}

	// Certificate verification & download router routes must not collide
	verifyResp := performJSON(router, http.MethodGet, fmt.Sprintf("/api/certificates/verify/%s/", certUUID), nil, "")
	if verifyResp.Code != http.StatusOK {
		t.Fatalf("expected 200 verifying certificate, got %d: %s", verifyResp.Code, verifyResp.Body.String())
	}
	dlResp := performJSON(router, http.MethodGet, fmt.Sprintf("/api/certificates/%d/download/", attemptID), nil, "")
	if dlResp.Code != http.StatusOK {
		t.Fatalf("expected 200 downloading certificate, got %d", dlResp.Code)
	}
}
