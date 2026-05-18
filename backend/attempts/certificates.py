"""Sertifikat generatsiyasi.

Pillow yordamida olympiad natijasi uchun PNG sertifikat tayyorlaydi.
Alohida Certificate modeli yo'q — sertifikat har safar TestAttempt'dan on-the-fly
yaratiladi. Bu strategiya saqlash xarajatini nolga tushiradi va attempt
o'chirilsa avtomatik bekor bo'ladi.
"""
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont


def _load_font(size, bold=False):
    """Loyiha ichida custom shrift yo'q — Pillow standart bitmap fontiga
    fallback. Production'da DejaVuSans odatda mavjud bo'ladi."""
    candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf' if bold else
        '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _measure(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def render_certificate_png(attempt):
    """Sertifikat PNG bytes qaytaradi. Attempt — TestAttempt instansi."""
    width, height = 1600, 1100
    bg = (250, 248, 240)
    border = (191, 149, 63)
    accent = (49, 46, 129)
    text_color = (30, 30, 50)

    img = Image.new('RGB', (width, height), bg)
    draw = ImageDraw.Draw(img)

    # Bordur
    margin = 40
    draw.rectangle([margin, margin, width - margin, height - margin], outline=border, width=8)
    draw.rectangle([margin + 16, margin + 16, width - margin - 16, height - margin - 16], outline=accent, width=2)

    title_font = _load_font(72, bold=True)
    sub_font = _load_font(32)
    name_font = _load_font(64, bold=True)
    body_font = _load_font(30)
    small_font = _load_font(22)
    footer_font = _load_font(20)

    user_name = (attempt.user.full_name or attempt.user.phone or 'Foydalanuvchi').strip()
    olympiad_title = attempt.olympiad.title
    center_name = attempt.olympiad.center.name if attempt.olympiad.center_id else ''
    score = attempt.score
    rank = attempt.rank
    date_str = attempt.submitted_at.strftime('%d.%m.%Y')

    def center_text(y, text, font, color=text_color):
        w, _ = _measure(draw, text, font)
        draw.text(((width - w) / 2, y), text, fill=color, font=font)

    center_text(120, 'SERTIFIKAT', title_font, accent)
    center_text(220, "Quyidagi shaxs olimpiadada ishtirok etganligi tasdiqlanadi", sub_font)

    center_text(330, user_name, name_font, accent)

    # Decorative line
    draw.line([(width / 2 - 220, 420), (width / 2 + 220, 420)], fill=border, width=3)

    center_text(460, olympiad_title, body_font)
    if center_name:
        center_text(510, center_name, small_font, (90, 90, 110))

    # Natija blok
    rank_label = f"#{rank}-o'rin" if rank else "—"
    score_text = f"{score}/100"
    center_text(620, "Natija", small_font, (100, 100, 120))
    center_text(660, score_text, name_font, accent)
    center_text(770, f"O'rin: {rank_label}", body_font)

    center_text(900, f"Sana: {date_str}", footer_font, (100, 100, 120))
    center_text(940, "Olympy platformasi tomonidan tasdiqlandi", footer_font, (100, 100, 120))

    buf = BytesIO()
    img.save(buf, format='PNG', optimize=True)
    buf.seek(0)
    return buf.getvalue()
