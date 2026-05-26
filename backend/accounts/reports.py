import io
import math
import random
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from django.db.models import Avg, Max, Q
from django.utils import timezone
from django.shortcuts import get_object_or_404

def _load_font(size, bold=False):
    """Tizimdagi standart shriftlarni yuklaydi."""
    candidates = [
        '/usr/share/fonts/truetype/lato/Lato-Bold.ttf' if bold else '/usr/share/fonts/truetype/lato/Lato-Regular.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        'Arial Bold' if bold else 'Arial',
        'Helvetica Bold' if bold else 'Helvetica',
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            try:
                return ImageFont.truetype(path + '.ttf', size=size)
            except OSError:
                continue
    return ImageFont.load_default()

def _measure(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]

def _draw_mock_qr(draw, bbox, seed_id, color=(99, 102, 241)):
    """Ota-onalar tekshirishi uchun mock QR kod chizadi."""
    x1, y1, x2, y2 = bbox
    draw.rectangle([x1, y1, x2, y2], outline=(99, 102, 241, 100), width=2)
    
    margin = 6
    qx1, qy1, qx2, qy2 = x1 + margin, y1 + margin, x2 - margin, y2 - margin
    qw, qh = qx2 - qx1, qy2 - qy1
    
    grid_size = 12
    cell_w = qw / grid_size
    cell_h = qh / grid_size
    
    rng = random.Random(seed_id)
    
    for r in range(grid_size):
        for c in range(grid_size):
            # Burchakdagi qidiruv belgilari
            if (r < 4 and c < 4) or (r < 4 and c >= grid_size - 4) or (r >= grid_size - 4 and c < 4):
                is_filled = True
                if (r == 1 or r == 2) and (1 <= c <= 2):
                    is_filled = False
                elif (r == 1 or r == 2) and (grid_size - 3 <= c <= grid_size - 2):
                    is_filled = False
                elif (grid_size - 3 <= r <= grid_size - 2) and (1 <= c <= 2):
                    is_filled = False
                if is_filled:
                    draw.rectangle([qx1 + c*cell_w, qy1 + r*cell_h, qx1 + (c+1)*cell_w, qy1 + (r+1)*cell_h], fill=color)
            elif rng.choice([True, False]):
                draw.rectangle([qx1 + c*cell_w, qy1 + r*cell_h, qx1 + (c+1)*cell_w, qy1 + (r+1)*cell_h], fill=color)

def wrap_text(text, font, max_width, draw):
    words = text.split(' ')
    lines = []
    current_line = []
    for word in words:
        test_line = ' '.join(current_line + [word])
        w, _ = _measure(draw, test_line, font)
        if w <= max_width:
            current_line.append(word)
        else:
            lines.append(' '.join(current_line))
            current_line = [word]
    if current_line:
        lines.append(' '.join(current_line))
    return lines

def generate_monthly_report_pdf(student):
    """Foydalanuvchining oylik natijalaridan hisobot kartasini generatsiya qiladi va PDF qaytaradi."""
    from attempts.models import TestAttempt

    # Natijalarni olish
    attempts = TestAttempt.objects.filter(user=student, disqualified=False).select_related('olympiad').order_by('-submitted_at')
    
    total_attempts = attempts.count()
    
    # Umumiy o'rtacha ball va to'g'ri/noto'g'ri savollar
    avg_score = 0
    best_score = 0
    total_correct = 0
    total_questions = 0
    
    if total_attempts > 0:
        avg_score = round(attempts.aggregate(avg=Avg('score'))['avg'] or 0)
        best_score = round(attempts.aggregate(best=Max('score'))['best'] or 0)
        for a in attempts:
            total_correct += a.correct_count
            total_questions += a.total_questions

    # Fanlar bo'yicha statistika
    subject_stats = {}
    for a in attempts:
        if not a.olympiad:
            continue
        sub = a.olympiad.subject or "Boshqa"
        data = subject_stats.setdefault(sub, {'scores': [], 'correct': 0, 'total': 0, 'attempts': 0})
        data['scores'].append(a.score)
        data['correct'] += a.correct_count
        data['total'] += a.total_questions
        data['attempts'] += 1

    subject_list = []
    for sub, data in subject_stats.items():
        sub_avg = round(sum(data['scores']) / len(data['scores']))
        subject_list.append({
            'name': sub,
            'avg': sub_avg,
            'attempts': data['attempts']
        })
    # Eng faol fanlar bo'yicha saralash
    subject_list = sorted(subject_list, key=lambda x: x['attempts'], reverse=True)[:5]

    # Dinamik tavsiyalar
    if total_attempts == 0:
        recommendation = (
            "Hozircha platformada topshirilgan olimpiadalar yoki mashqlar mavjud emas. Farzandingizning bilim darajasini "
            "aniqlash hamda hisobotni shakllantirish uchun kamida 1 ta olimpiada yoki mashq to'plamini yechishini tavsiya etamiz."
        )
    elif avg_score >= 85:
        recommendation = (
            f"Ajoyib ko'rsatkich! Farzandingiz o'rtacha {avg_score}% natija bilan yuqori bilim saviyasini namoyish qilmoqda. "
            "U murakkab muammolarni osongina hal qiladi. Tavsiya: Mavzularni yanada chuqurlashtirish, milliy va xalqaro olimpiada "
            "masalalarini yechib borish hamda tizimdagi eng qiyin savollar ustida ishlash."
        )
    elif avg_score >= 70:
        recommendation = (
            f"Yaxshi natija! Farzandingiz o'rtacha {avg_score}% ball bilan barqaror rivojlanmoqda. "
            "Biroq, ba'zi mavzularda kichik kamchiliklar mavjud. Tavsiya: Natijalar tahlili sahifasiga o'tib, 'AI Yechim Tushuntirishi' "
            "tizimidan foydalangan holda xatolar ustida muntazam ishlab borish va har kuni kamida 1 ta mashq yechish."
        )
    elif avg_score >= 50:
        recommendation = (
            f"Qoniqarli natija. O'rtacha o'zlashtirish darajasi {avg_score}% ni tashkil etadi. "
            "Farzandingiz mavzularning asosiy qismini tushunadi, ammo amaliyot yetishmaydi. Tavsiya: Kundalik 'Mashq Rejimi' bo'limida "
            "o'zi xato qilgan fanlar bo'yicha ko'proq test yechishi, shuningdek o'quv markazidagi darslarni yaxshilab takrorlashi lozim."
        )
    else:
        recommendation = (
            f"Diqqat qiling! Farzandingizning o'rtacha o'zlashtirish darajasi {avg_score}% bo'lib, o'quv jarayonida qiynalayotganidan "
            "dalolat beradi. Tavsiya: O'tilgan mavzularni tubdan qayta o'rganish, oddiy mashqlardan boshlash, xatolarga "
            "AI tushuntirishlarini erinmay o'qib chiqish hamda ustozlari bilan qo'shimcha maslahatlashish."
        )

    # 1200 x 1700 A4 formatdagi rasm yaratamiz (To'q premium fon)
    width, height = 1200, 1700
    bg_color = (6, 8, 24)       # Deep dark blue
    card_bg = (14, 17, 45)      # Card dark blue
    border_color = (32, 41, 95)  # Card borders
    accent_purple = (99, 102, 241) # Brand Indigo
    text_white = (255, 255, 255)
    text_gray = (148, 163, 184)
    text_muted = (100, 116, 139)

    img = Image.new('RGB', (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # 1. Glowing decorative circles (background gradients)
    # Top glow
    for r in range(300, 0, -2):
        alpha = int(20 * (1 - r/300))
        draw.ellipse([600-r, -150-r, 600+r, -150+r], fill=(99, 102, 241, alpha))

    # Fonts
    font_title = _load_font(36, bold=True)
    font_subtitle = _load_font(20)
    font_section = _load_font(26, bold=True)
    font_body = _load_font(18)
    font_body_bold = _load_font(18, bold=True)
    font_metric_num = _load_font(38, bold=True)
    font_metric_lbl = _load_font(14)
    font_logo = _load_font(28, bold=True)

    # 2. Header
    # Draw Logo Icon (glowing rounded square with O)
    draw.rounded_rectangle([80, 80, 130, 130], radius=12, fill=accent_purple)
    w_o, h_o = _measure(draw, "O", font_logo)
    draw.text((105 - w_o/2, 105 - h_o/2), "O", fill=text_white, font=font_logo)
    
    draw.text((145, 90), "OLYMPY", fill=text_white, font=font_logo)
    draw.text((80, 160), "OYLIK RIVOJLANISH HISOBOTI", fill=text_white, font=font_title)
    
    current_month = timezone.now().strftime('%B, %Y')
    # O'zbek tiliga o'tkazish
    months_uz = {
        'January': 'Yanvar', 'February': 'Fevral', 'March': 'Mart', 'April': 'Aprel',
        'May': 'May', 'June': 'Iyun', 'July': 'Iyul', 'August': 'Avgust',
        'September': 'Sentabr', 'October': 'Oktabr', 'November': 'Noyabr', 'December': 'Dekabr'
    }
    month_en = timezone.now().strftime('%B')
    month_uz = months_uz.get(month_en, month_en)
    date_str = f"Hisobot davri: {month_uz} {timezone.now().strftime('%Y')}"
    draw.text((80, 215), date_str, fill=text_gray, font=font_subtitle)

    # Decorative Line
    draw.line([80, 255, 1120, 255], fill=border_color, width=2)

    # 3. Student Profile Card
    draw.rounded_rectangle([80, 280, 1120, 440], radius=24, fill=card_bg, outline=border_color, width=2)
    
    # Avatar Circle
    cx, cy, r_avatar = 150, 360, 50
    draw.ellipse([cx-r_avatar, cy-r_avatar, cx+r_avatar, cy+r_avatar], fill=(30, 41, 59))
    # Initials
    initials = student.full_name[:2].upper() if student.full_name else "ST"
    w_init, h_init = _measure(draw, initials, font_section)
    draw.text((cx - w_init/2, cy - h_init/2 - 2), initials, fill=accent_purple, font=font_section)

    # Student Info Text
    student_name = student.full_name or "Talaba"
    draw.text((230, 320), student_name, fill=text_white, font=font_section)
    draw.text((230, 365), f"Tel: {student.normalized_phone or student.phone or '—'}", fill=text_gray, font=font_body)
    
    # Right side of profile card: status and streak
    draw.text((800, 325), "Platforma roli: O'quvchi", fill=text_gray, font=font_body)
    draw.text((800, 365), f"Ketma-ket faollik: 🔥 {student.streak_count} kun", fill=(245, 158, 11), font=font_body_bold)

    # 4. Metric Cards (4 Grid)
    metric_data = [
        {"lbl": "OLIMPIADALAR", "val": f"{total_attempts} ta", "col": (99, 102, 241)},
        {"lbl": "O'RTACHA BALL", "val": f"{avg_score}%", "col": (16, 185, 129) if avg_score >= 70 else ((245, 158, 11) if avg_score >= 50 else (239, 68, 68))},
        {"lbl": "TO'G'RI JAVOBLAR", "val": f"{total_correct}/{total_questions}" if total_questions else "—", "col": (14, 165, 233)},
        {"lbl": "ENG YUQORI BALL", "val": f"{best_score}%", "col": (168, 85, 247)}
    ]
    card_w = 235
    card_h = 140
    gap = 40
    for i, m in enumerate(metric_data):
        x1 = 80 + i * (card_w + gap)
        y1 = 480
        x2 = x1 + card_w
        y2 = y1 + card_h
        
        draw.rounded_rectangle([x1, y1, x2, y2], radius=20, fill=card_bg, outline=border_color, width=2)
        
        # Indicator line
        draw.line([x1 + 25, y1 + 10, x2 - 25, y1 + 10], fill=m["col"], width=4)
        
        # Value
        w_val, _ = _measure(draw, m["val"], font_metric_num)
        draw.text((x1 + (card_w - w_val)/2, y1 + 35), m["val"], fill=text_white, font=font_metric_num)
        
        # Label
        w_lbl, _ = _measure(draw, m["lbl"], font_metric_lbl)
        draw.text((x1 + (card_w - w_lbl)/2, y1 + 95), m["lbl"], fill=text_gray, font=font_metric_lbl)

    # 5. Subject Breakdown Section
    draw.text((80, 660), "FANLAR BO'YICHA O'ZLASHTIRISH", fill=text_white, font=font_section)
    
    # Subject breakdown container
    sub_y1 = 710
    sub_h = 420
    draw.rounded_rectangle([80, sub_y1, 1120, sub_y1 + sub_h], radius=24, fill=card_bg, outline=border_color, width=2)
    
    if len(subject_list) == 0:
        empty_text = "Hozircha fanlar bo'yicha yetarli natijalar mavjud emas."
        w_emp, _ = _measure(draw, empty_text, font_subtitle)
        draw.text((600 - w_emp/2, sub_y1 + sub_h/2 - 10), empty_text, fill=text_gray, font=font_subtitle)
    else:
        for idx, sub in enumerate(subject_list):
            row_y = sub_y1 + 45 + idx * 72
            
            # Index / Subject Name
            sub_title = f"{idx+1}. {sub['name']}"
            draw.text((120, row_y), sub_title, fill=text_white, font=font_body_bold)
            
            # Details: count
            draw.text((120, row_y + 25), f"Ishtirok: {sub['attempts']} marta", fill=text_gray, font=font_metric_lbl)
            
            # Progress Bar Layout
            bar_x = 550
            bar_w = 400
            bar_h = 16
            
            # Back bar
            draw.rounded_rectangle([bar_x, row_y + 12, bar_x + bar_w, row_y + 12 + bar_h], radius=8, fill=(30, 41, 59))
            
            # Fill bar
            pct = sub['avg']
            fill_w = int(bar_w * (pct / 100))
            
            # Bar color
            bar_color = (16, 185, 129) if pct >= 75 else ((245, 158, 11) if pct >= 50 else (239, 68, 68))
            if fill_w > 0:
                draw.rounded_rectangle([bar_x, row_y + 12, bar_x + fill_w, row_y + 12 + bar_h], radius=8, fill=bar_color)
                
            # Ball % Text
            pct_str = f"{pct}%"
            draw.text((bar_x + bar_w + 25, row_y + 8), pct_str, fill=text_white, font=font_body_bold)

    # 6. Recommendations Card
    draw.text((80, 1180), "USTOZ VA AI TAVSIYALARI", fill=text_white, font=font_section)
    
    rec_y1 = 1230
    rec_h = 240
    draw.rounded_rectangle([80, rec_y1, 1120, rec_y1 + rec_h], radius=24, fill=(18, 18, 48), outline=(59, 46, 140), width=2)
    
    # Bullet icon
    draw.ellipse([115, rec_y1 + 45, 130, rec_y1 + 60], fill=accent_purple)
    
    # Write wrapped recommendations
    lines = wrap_text(recommendation, font_body, 920, draw)
    for line_idx, line in enumerate(lines):
        draw.text((155, rec_y1 + 40 + line_idx * 30), line, fill=(226, 232, 240), font=font_body)

    # 7. Footer Section
    # Stamp / Watermark
    draw.text((80, 1545), "Ushbu hisobot Olympy tahlil tizimi tomonidan avtomatik ravishda", fill=text_muted, font=font_subtitle)
    draw.text((80, 1575), "shakllantirildi va ota-onalar nazorati uchun taqdim etildi.", fill=text_muted, font=font_subtitle)
    
    # Stamp Mock
    draw.rounded_rectangle([800, 1520, 1000, 1600], radius=8, fill=None, outline=(34, 197, 94, 80), width=2)
    draw.text((815, 1542), "TASDIQLANDI", fill=(34, 197, 94), font=font_body_bold)
    draw.text((815, 1568), "OLYMPY CORE", fill=(34, 197, 94), font=font_subtitle)

    # QR Code Mock
    _draw_mock_qr(draw, [1030, 1515, 1120, 1605], student.id)

    # Save to PDF
    pdf_buffer = io.BytesIO()
    img.save(pdf_buffer, format='PDF')
    pdf_buffer.seek(0)
    
    return pdf_buffer.getvalue()
