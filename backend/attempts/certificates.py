"""Sertifikat generatsiyasi.

Pillow yordamida olimpiada natijasi uchun premium PNG sertifikat tayyorlaydi.
Alohida Certificate modeli yo'q — sertifikat har safar TestAttempt'dan on-the-fly
yaratiladi. Bu strategiya saqlash xarajatini nolga tushiradi va attempt
o'chirilsa avtomatik bekor bo'ladi.
"""
from io import BytesIO
import math
import random

from PIL import Image, ImageDraw, ImageFont


def _load_font(size, bold=False):
    """Tizimdagi chiroyli standart shriftlarni qidirib yuklaydi.
    Agar topilmasa, standart Pillow fontiga fallback qiladi."""
    candidates = [
        # Lato (Zamonaviy va premium ko'rinish uchun)
        '/usr/share/fonts/truetype/lato/Lato-Bold.ttf' if bold else '/usr/share/fonts/truetype/lato/Lato-Regular.ttf',
        # LiberationSans
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        # DejaVuSans
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        # Standart tizim yo'llari (Arial/Helvetica fallback)
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


def _draw_star(draw, cx, cy, R, r, color=(200, 160, 80)):
    """Ko'rsatilgan markaz (cx, cy) bo'yicha 5 burchakli chiroyli geometrik yulduz chizadi.
    Tizim shriftlarida yulduz belgisi bo'lmasa ham to'g'ri chiqishini ta'minlaydi."""
    points = []
    for i in range(10):
        angle = i * math.pi / 5 - math.pi / 2  # tepadan boshlanadi (-90 gradus)
        radius = R if i % 2 == 0 else r
        x = cx + radius * math.cos(angle)
        y = cy + radius * math.sin(angle)
        points.append((x, y))
    draw.polygon(points, fill=color)


def _draw_mock_qr(draw, bbox, seed_id, color=(11, 46, 122)):
    """O'ng pastki burchakda haqiqiy QR-kodga o'xshash mock tasvir chizadi."""
    x1, y1, x2, y2 = bbox
    # Oltin ramka
    draw.rectangle([x1, y1, x2, y2], outline=(200, 160, 80), width=3)
    
    margin = 8
    qx1, qy1, qx2, qy2 = x1 + margin, y1 + margin, x2 - margin, y2 - margin
    qw, qh = qx2 - qx1, qy2 - qy1
    
    grid_size = 15
    cell_w = qw / grid_size
    cell_h = qh / grid_size
    
    rng = random.Random(seed_id)
    
    # 3 ta burchakdagi to'rtburchak qidiruv belgilari (Finder patterns)
    # 1. Top-Left
    for r in range(5):
        for c in range(5):
            is_filled = True
            if (r == 1 or r == 3) and (1 <= c <= 3):
                is_filled = False
            elif r == 2 and (c == 1 or c == 3):
                is_filled = False
            if is_filled:
                rx1 = qx1 + c * cell_w
                ry1 = qy1 + r * cell_h
                rx2 = rx1 + cell_w
                ry2 = ry1 + cell_h
                draw.rectangle([rx1, ry1, rx2, ry2], fill=color)
                
    # 2. Top-Right
    for r in range(5):
        for c in range(grid_size - 5, grid_size):
            cc = c - (grid_size - 5)
            is_filled = True
            if (r == 1 or r == 3) and (1 <= cc <= 3):
                is_filled = False
            elif r == 2 and (cc == 1 or cc == 3):
                is_filled = False
            if is_filled:
                rx1 = qx1 + c * cell_w
                ry1 = qy1 + r * cell_h
                rx2 = rx1 + cell_w
                ry2 = ry1 + cell_h
                draw.rectangle([rx1, ry1, rx2, ry2], fill=color)
                
    # 3. Bottom-Left
    for r in range(grid_size - 5, grid_size):
        for c in range(5):
            rr = r - (grid_size - 5)
            is_filled = True
            if (rr == 1 or rr == 3) and (1 <= c <= 3):
                is_filled = False
            elif rr == 2 and (c == 1 or c == 3):
                is_filled = False
            if is_filled:
                rx1 = qx1 + c * cell_w
                ry1 = qy1 + r * cell_h
                rx2 = rx1 + cell_w
                ry2 = ry1 + cell_h
                draw.rectangle([rx1, ry1, rx2, ry2], fill=color)
                
    # Qolgan joylarni psevdo-tasodifiy to'ldirish
    for r in range(grid_size):
        for c in range(grid_size):
            if r < 5 and c < 5:
                continue
            if r < 5 and c >= grid_size - 5:
                continue
            if r >= grid_size - 5 and c < 5:
                continue
            if rng.choice([True, False]):
                rx1 = qx1 + c * cell_w
                ry1 = qy1 + r * cell_h
                rx2 = rx1 + cell_w
                ry2 = ry1 + cell_h
                draw.rectangle([rx1, ry1, rx2, ry2], fill=color)


def render_certificate_png(attempt):
    """Sertifikat PNG bytes qaytaradi. Attempt — TestAttempt instansi."""
    width, height = 1600, 1100
    
    # Premium ranglar palitrasi
    bg_color = (246, 245, 240)      # Oq-sarg'ish fon (Alabaster/Off-white)
    gold_color = (200, 160, 80)     # Premium Oltin (Gold)
    blue_color = (11, 46, 122)      # To'q Ko'k (Royal Blue)
    text_dark = (40, 40, 50)        # To'q kulrang matn
    text_muted = (100, 100, 120)    # Muted matn
    
    img = Image.new('RGB', (width, height), bg_color)
    draw = ImageDraw.Draw(img)
    
    # --- 1. Ramkalar (Double Borders) ---
    margin = 40
    # Tashqi ingichka oltin ramka
    draw.rectangle([margin, margin, width - margin, height - margin], outline=gold_color, width=4)
    # Ichki qalin to'q ko'k ramka
    draw.rectangle([margin + 16, margin + 16, width - margin - 16, height - margin - 16], outline=blue_color, width=8)
    
    # --- 2. Burchaklardagi Bezaklar (Corner Accents) ---
    # Top-Left
    draw.polygon([(56, 56), (176, 56), (56, 176)], fill=blue_color)
    draw.polygon([(56, 56), (126, 56), (56, 126)], fill=gold_color)
    # Top-Right
    draw.polygon([(width - 56, 56), (width - 176, 56), (width - 56, 176)], fill=blue_color)
    draw.polygon([(width - 56, 56), (width - 126, 56), (width - 56, 126)], fill=gold_color)
    # Bottom-Left
    draw.polygon([(56, height - 56), (176, height - 56), (56, height - 176)], fill=blue_color)
    draw.polygon([(56, height - 56), (126, height - 56), (56, height - 126)], fill=gold_color)
    # Bottom-Right
    draw.polygon([(width - 56, height - 56), (width - 176, height - 56), (width - 56, height - 176)], fill=blue_color)
    draw.polygon([(width - 56, height - 56), (width - 126, height - 56), (width - 56, height - 126)], fill=gold_color)
    
    # --- 3. Shriftlar ---
    title_font = _load_font(56, bold=True)
    sub_font = _load_font(24)
    name_font = _load_font(52, bold=True)
    body_font = _load_font(28, bold=True)
    small_font = _load_font(20)
    footer_font = _load_font(18)
    wreath_bold_font = _load_font(36, bold=True)
    wreath_font = _load_font(24)
    
    # --- 4. Matn yozish yordamchi funksiyalari ---
    def center_text(y, text, font, color=text_dark):
        w, _ = _measure(draw, text, font)
        draw.text(((width - w) / 2, y), text, fill=color, font=font)
        
    def center_text_on_point(cx, cy, text, font, color=text_dark):
        w, h = _measure(draw, text, font)
        draw.text((cx - w / 2, cy - h / 2), text, fill=color, font=font)
        
    def right_align_text(x, y, text, font, color=text_dark):
        w, _ = _measure(draw, text, font)
        draw.text((x - w, y), text, fill=color, font=font)
        
    # --- 5. Ma'lumotlarni tayyorlash ---
    user_name = (attempt.user.full_name or attempt.user.phone or 'Foydalanuvchi').strip()
    olympiad_title = attempt.olympiad.title
    center_name = attempt.olympiad.center.name if (attempt.olympiad.center_id and attempt.olympiad.center) else ''
    score = attempt.score
    rank = attempt.rank
    date_str = attempt.submitted_at.strftime('%d.%m.%Y')
    
    # --- 5b. Markaz logotipi (yuqori o'ng burchak) ---
    # `center.image` mavjud bo'lsa, uni 120x120 px rounded-corner sifatida
    # chizib qo'yamiz. Logoyo'q bo'lsa hech narsa o'zgarmaydi.
    try:
        center_obj = attempt.olympiad.center if attempt.olympiad.center_id else None
        if center_obj and getattr(center_obj, 'image', None) and getattr(center_obj.image, 'name', ''):
            from django.core.files.storage import default_storage
            logo_size = 120
            logo_x = width - margin - 40 - logo_size  # 40 = burchak bezagidan oraliq
            logo_y = margin + 40
            try:
                with default_storage.open(center_obj.image.name, 'rb') as fh:
                    logo_bytes = fh.read()
            except Exception:
                logo_bytes = None
            if logo_bytes:
                from io import BytesIO as _BytesIO
                logo_img = Image.open(_BytesIO(logo_bytes)).convert('RGBA')
                # Fit kvadrat bo'lishi uchun crop (markazdan).
                lw, lh = logo_img.size
                if lw != lh:
                    side = min(lw, lh)
                    lx = (lw - side) // 2
                    ly = (lh - side) // 2
                    logo_img = logo_img.crop((lx, ly, lx + side, ly + side))
                logo_img = logo_img.resize((logo_size, logo_size), Image.LANCZOS)
                # Rounded corner mask
                mask = Image.new('L', (logo_size, logo_size), 0)
                ImageDraw.Draw(mask).rounded_rectangle(
                    (0, 0, logo_size, logo_size), radius=18, fill=255,
                )
                img.paste(logo_img, (logo_x, logo_y), mask)
                # Nozik oltin chiziq bilan ramka
                draw.rounded_rectangle(
                    (logo_x - 2, logo_y - 2, logo_x + logo_size + 2, logo_y + logo_size + 2),
                    radius=20, outline=gold_color, width=2,
                )
    except Exception:
        # Logo bo'lmasa yoki o'qib bo'lmasa — fallback, hech narsa qilmaymiz.
        pass

    # --- 6. Matnlar va Sarlavhalarni joylashtirish ---
    center_text(150, "MUVAFFAQIYAT SERTIFIKATI", title_font, blue_color)
    center_text(235, "Ushbu sertifikat Olympy platformasidagi muvaffaqiyatli ishtiroki va", sub_font, text_muted)
    center_text(275, "yuqori natijalari uchun topshiriladi", sub_font, text_muted)
    
    center_text(360, user_name, name_font, blue_color)
    
    # Dekoratib oltin chiziq va markazdagi romb
    draw.line([(width / 2 - 250, 450), (width / 2 + 250, 450)], fill=gold_color, width=3)
    draw.polygon([(800, 440), (810, 450), (800, 460), (790, 450)], fill=gold_color)
    
    center_text(490, olympiad_title, body_font, text_dark)
    if center_name:
        center_text(540, f"Tashkilotchi: {center_name}", small_font, text_muted)
        
    # --- 7. Markaziy Oltin Gulchambar (Laurel Wreath) ---
    cx, cy = 800, 740
    r = 110
    # Asosiy yoylar
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=95, end=265, fill=gold_color, width=3)
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=-85, end=85, fill=gold_color, width=3)
    
    # Gulchambar barglari
    leaf_w, leaf_h = 24, 10
    # Chap tomondagi barglar
    for angle_deg in range(100, 270, 15):
        angle_rad = math.radians(angle_deg)
        lx = cx + r * math.cos(angle_rad)
        ly = cy + r * math.sin(angle_rad)
        rot = angle_rad + math.pi / 2
        cos_r, sin_r = math.cos(rot), math.sin(rot)
        p1 = (lx + cos_r * leaf_w, ly + sin_r * leaf_w)
        p2 = (lx - sin_r * leaf_h, ly + cos_r * leaf_h)
        p3 = (lx - cos_r * leaf_w, ly - sin_r * leaf_w)
        p4 = (lx + sin_r * leaf_h, ly - cos_r * leaf_h)
        draw.polygon([p1, p2, p3, p4], fill=gold_color)
        
    # O'ng tomondagi barglar
    for angle_deg in range(-80, 90, 15):
        angle_rad = math.radians(angle_deg)
        lx = cx + r * math.cos(angle_rad)
        ly = cy + r * math.sin(angle_rad)
        rot = angle_rad - math.pi / 2
        cos_r, sin_r = math.cos(rot), math.sin(rot)
        p1 = (lx + cos_r * leaf_w, ly + sin_r * leaf_w)
        p2 = (lx - sin_r * leaf_h, ly + cos_r * leaf_h)
        p3 = (lx - cos_r * leaf_w, ly - sin_r * leaf_w)
        p4 = (lx + sin_r * leaf_h, ly - cos_r * leaf_h)
        draw.polygon([p1, p2, p3, p4], fill=gold_color)
        
    # Gulchambar ichidagi natijalar
    rank_label = f"1-O'RIN" if rank == 1 else (f"{rank}-O'RIN" if rank else "ISHTIROKCHI")
    center_text_on_point(cx, cy - 25, rank_label, wreath_bold_font, gold_color)
    center_text_on_point(cx, cy + 25, f"{score} ball", wreath_font, blue_color)
    
    # --- 8. Imzo Bloki (Bottom Left) ---
    # Muhr doirasi (Gold Seal)
    seal_cx, seal_cy = 350, 830
    seal_r = 45
    draw.ellipse([seal_cx - seal_r, seal_cy - seal_r, seal_cx + seal_r, seal_cy + seal_r], outline=gold_color, width=3)
    # Muhr ichidagi geometrik 5 burchakli yulduz
    _draw_star(draw, seal_cx, seal_cy, 22, 9, gold_color)
    
    # Imzo chizig'i
    draw.line([(200, 930), (500, 930)], fill=blue_color, width=2)
    center_text_on_point(350, 955, "Tashkiliy Qo'mita", _load_font(18, bold=True), text_dark)
    center_text_on_point(350, 980, "Direktor", _load_font(16), text_muted)
    
    # --- 9. QR-kod va Sana (Bottom Right) ---
    qr_bbox = (1330, 840, 1480, 990)
    _draw_mock_qr(draw, qr_bbox, attempt.id, blue_color)
    
    right_align_text(1300, 860, f"Sana: {date_str}", footer_font, text_muted)
    right_align_text(1300, 900, f"Sertifikat ID: {attempt.id}", footer_font, text_muted)
    right_align_text(1300, 940, "QR-kod orqali tekshiring", _load_font(16, bold=True), blue_color)
    
    # Rasmni saqlab bytes qaytarish
    buf = BytesIO()
    img.save(buf, format='PNG', optimize=True)
    buf.seek(0)
    return buf.getvalue()
