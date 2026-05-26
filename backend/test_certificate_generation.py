import os
import sys
from datetime import datetime

# Backend papkasini Python path'ga qo'shish
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from attempts.certificates import render_certificate_png

class MockCenter:
    name = "Toshkent Axborot Texnologiyalari Universiteti"

class MockOlympiad:
    title = "Matematika va Algoritmlash Olimpiadasi"
    center = MockCenter()
    center_id = 12

class MockUser:
    full_name = "Abdumajidov Diyorbek"
    phone = "+998901234567"

class MockAttempt:
    id = 12345
    user = MockUser()
    olympiad = MockOlympiad()
    score = 95
    rank = 1
    submitted_at = datetime.now()

def main():
    print("Sertifikat generatsiyasi test qilinmoqda...")
    attempt = MockAttempt()
    
    try:
        png_bytes = render_certificate_png(attempt)
        output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_certificate_output.png")
        
        with open(output_path, "wb") as f:
            f.write(png_bytes)
            
        print(f"Muvaffaqiyatli saqlandi: {output_path}")
    except Exception as e:
        print("Xatolik yuz berdi:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
