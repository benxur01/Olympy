package services

import (
	"fmt"
	"html"
	"olympy-backend-go/internal/models"
	"time"
)

// GenerateCertificateHTML generates an official, print-ready certificate document with escaped text.
func GenerateCertificateHTML(attempt models.TestAttempt, studentName string, olympiadTitle string, certUUID string) string {
	dateStr := time.Now().Format("02.01.2006")
	if attempt.SubmittedAt != nil {
		dateStr = attempt.SubmittedAt.Format("02.01.2006")
	}

	safeName := html.EscapeString(studentName)
	safeTitle := html.EscapeString(olympiadTitle)
	safeUUID := html.EscapeString(certUUID)

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<title>Olympy Rasmiy Sertifikati</title>
<style>
  body {
    margin: 0;
    padding: 40px;
    background: #f0f2f5;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .certificate-card {
    width: 800px;
    background: #ffffff;
    border: 12px double #1e3a8a;
    padding: 50px 40px;
    text-align: center;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    position: relative;
    border-radius: 8px;
  }
  .title {
    font-size: 38px;
    color: #1e3a8a;
    text-transform: uppercase;
    font-weight: 800;
    letter-spacing: 2px;
    margin-bottom: 5px;
  }
  .subtitle {
    font-size: 18px;
    color: #64748b;
    margin-bottom: 30px;
  }
  .awarded-to {
    font-size: 16px;
    color: #475569;
    margin-bottom: 10px;
  }
  .student-name {
    font-size: 32px;
    font-weight: bold;
    color: #0f172a;
    border-bottom: 2px solid #cbd5e1;
    display: inline-block;
    padding: 0 30px 10px 30px;
    margin-bottom: 25px;
  }
  .description {
    font-size: 16px;
    color: #334155;
    line-height: 1.6;
    max-width: 600px;
    margin: 0 auto 30px auto;
  }
  .score-badge {
    display: inline-block;
    background: #eff6ff;
    border: 2px solid #3b82f6;
    color: #1d4ed8;
    padding: 10px 25px;
    border-radius: 30px;
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 40px;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 20px;
    border-top: 1px solid #e2e8f0;
    padding-top: 25px;
  }
  .seal {
    font-weight: bold;
    color: #1e3a8a;
    font-size: 15px;
  }
  .qr-box {
    text-align: right;
    font-size: 12px;
    color: #64748b;
  }
</style>
</head>
<body>
  <div class="certificate-card">
    <div class="title">SERTIFIKAT</div>
    <div class="subtitle">Olympy Milliy Ta'lim Platformasi</div>
    
    <div class="awarded-to">Ushbu sertifikat bilan taqdirlanadi:</div>
    <div class="student-name">%s</div>
    
    <div class="description">
      <strong>"%s"</strong> olimpiadasida faol ishtirok etib, o'zining yuksak bilim va intellektual salohiyatini muvaffaqiyatli namoyon etdi.
    </div>
    
    <div class="score-badge">To'plangan ball: %d / %d (%.1f%%)</div>
    
    <div class="footer">
      <div class="seal">
        ✓ Rasmiy tasdiqlangan<br>
        Sana: %s
      </div>
      <div class="qr-box">
        UUID: %s<br>
        Haqiqiyligini tekshirish:<br>
        prolymp.uz/verify/%s
      </div>
    </div>
  </div>
</body>
</html>`, safeName, safeTitle, attempt.Score, attempt.MaxScore, attempt.Percentage, dateStr, safeUUID, safeUUID)
}
