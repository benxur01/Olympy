package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// SwaggerDocs renders a full interactive OpenAPI Swagger UI in the browser
func SwaggerDocs(c *gin.Context) {
	html := `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Olympy API Documentation (Swagger)</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; background: #fafafa; }
    .topbar { background: #1e3a8a !important; padding: 10px 20px; color: white; font-weight: bold; font-family: sans-serif; font-size: 18px; }
  </style>
</head>
<body>
  <div class="topbar">🚀 Olympy High-Performance Go API Documentation</div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, html)
}

// OpenAPISpec returns the OpenAPI 3.0 specification in JSON
func OpenAPISpec(c *gin.Context) {
	spec := gin.H{
		"openapi": "3.0.0",
		"info": gin.H{
			"title":       "Olympy Enterprise Go REST API",
			"version":     "2.0.0",
			"description": "Olympy online olimpiada platformasi uchun yuqori tezlikdagi Go (Golang) REST API spetsifikatsiyasi.",
		},
		"servers": []gin.H{
			{"url": "http://localhost:8000", "description": "Lokal server"},
		},
		"paths": gin.H{
			"/api/health/": gin.H{
				"get": gin.H{"summary": "Server va DB salomatlik tekshiruvi", "responses": gin.H{"200": gin.H{"description": "OK"}}},
			},
			"/api/auth/register/": gin.H{
				"post": gin.H{"summary": "Foydalanuvchini ro'yxatdan o'tkazish", "responses": gin.H{"201": gin.H{"description": "Yaratildi"}}},
			},
			"/api/auth/login/": gin.H{
				"post": gin.H{"summary": "Tizimga kirish va JWT olish", "responses": gin.H{"200": gin.H{"description": "Muvaffaqiyatli"}}},
			},
			"/api/auth/phone/start-telegram-verification/": gin.H{
				"post": gin.H{"summary": "Telefon OTP tasdiqlashni boshlash", "responses": gin.H{"200": gin.H{"description": "Kod yuborildi"}}},
			},
			"/api/auth/2fa/setup/": gin.H{
				"post": gin.H{"summary": "2FA (Google Authenticator) sozlash", "responses": gin.H{"200": gin.H{"description": "Secret yaratildi"}}},
			},
			"/api/centers/": gin.H{
				"get": gin.H{"summary": "O'quv markazlari ro'yxati", "responses": gin.H{"200": gin.H{"description": "Ro'yxat"}}},
				"post": gin.H{"summary": "Yangi markaz ochish", "responses": gin.H{"201": gin.H{"description": "Yaratildi"}}},
			},
			"/api/olympiads/": gin.H{
				"get": gin.H{"summary": "Olimpiadalar ro'yxati", "responses": gin.H{"200": gin.H{"description": "Ro'yxat"}}},
				"post": gin.H{"summary": "Yangi olimpiada yaratish", "responses": gin.H{"201": gin.H{"description": "Yaratildi"}}},
			},
			"/api/attempts/": gin.H{
				"post": gin.H{"summary": "Test topshirish va avtomatik baholash", "responses": gin.H{"201": gin.H{"description": "Natija chiqarildi"}}},
			},
			"/api/attempts/session/start/": gin.H{
				"post": gin.H{"summary": "Anti-cheat imtihon sessiyasini boshlash", "responses": gin.H{"201": gin.H{"description": "Boshlandi"}}},
			},
			"/api/attempts/code/submit/": gin.H{
				"post": gin.H{"summary": "Dasturlash (Judge0) kodini topshirish", "responses": gin.H{"201": gin.H{"description": "Qabul qilindi"}}},
			},
			"/api/certificates/verify/{uuid}": gin.H{
				"get": gin.H{"summary": "Rasmiy sertifikat haqiqiyligini tekshirish", "responses": gin.H{"200": gin.H{"description": "Tekshirildi"}}},
			},
			"/api/billing/plans/": gin.H{
				"get": gin.H{"summary": "Obuna rejalari", "responses": gin.H{"200": gin.H{"description": "Rejalar"}}},
			},
			"/api/billing/payme/": gin.H{
				"post": gin.H{"summary": "Payme JSON-RPC 2.0 to'lov webhoki", "responses": gin.H{"200": gin.H{"description": "JSON-RPC javob"}}},
			},
			"/api/billing/click/": gin.H{
				"post": gin.H{"summary": "Click to'lov webhoki", "responses": gin.H{"200": gin.H{"description": "Click javob"}}},
			},
		},
	}
	c.JSON(http.StatusOK, spec)
}
