#!/usr/bin/env python3
"""PT Sans / PT Sans Narrow woff2 fayllariga U+02BB (ʻ) glifini qo'shadi.

NEGA KERAK
==========
U+02BB (MODIFIER LETTER TURNED COMMA, `ʻ`) — o'zbek lotin alifbosidagi `oʻ` va
`gʻ` harflarining belgisi, ya'ni interfeysda eng ko'p uchraydigan maxsus belgi.
Backend ham uni chiqaradi (`backend/centers/ai_roster.py`, `views_premium.py`,
`manager_bot.py`, `accounts/tasks.py`, `olympiads/serializers.py`), demak API
javoblari orqali UI'ga tushadi.

Lekin PT Sans va PT Sans Narrow da bu glif YO'Q — na Google subsetlarida, na
ParaType'ning original 749-glifli TTF'ida. Bu subsetlash artefakti emas, shrift
darajasidagi kamchilik. Yamoqsiz brauzer belgi-belgi fallback qiladi va faqat
`ʻ` tizim shriftidan (`system-ui`) kelib, qolgan matn PT Sans'da qoladi — ishlaydi,
lekin bir so'z ichida ikki xil shrift aralashadi.

NIMA QILINADI
=============
Yangi glif chizilmaydi. Shriftda ALLAQACHON bor `quoteleft` (U+2018 LEFT SINGLE
QUOTATION MARK) glifi cmap'da U+02BB kodiga HAM ulanadi:

    U+02BB  ─┐
             ├─►  quoteleft   (bitta glif, ikkita kod)
    U+2018  ─┘

Tipografik jihatdan bu to'g'ri: U+2018 ham, U+02BB ham "ko'tarilgan burilgan
vergul" (6 shaklidagi), farqi faqat Unicode toifasida (tinish belgisi / modifier
harf), shaklida emas.

Buni shriftning O'ZI tasdiqlaydi: ParaType U+02BC (`ʼ`) ni aynan shu usulda
qilgan — `uni02BC` mustaqil glif emas, `quoteright` (U+2019) ga nol siljishli
composite havola. Ya'ni biz U+02BB uchun U+02BC dagi mavjud naqshni takrorlaymiz:

    U+02BC ─► uni02BC ─► quoteright   (ParaType shunday qilgan)
    U+02BB ─► quoteleft              (shu skript shunday qiladi)

Natijada `ʻ` va `ʼ` bir-biridan farq qiladi (burilgan vergul / apostrof) va
ikkalasi ham bitta shriftdan keladi.

Faqat `*-latin.woff2` fayllar yamaladi: U+02BB latin diapazonida va
`src/index.css` dagi latin `@font-face` larning `unicode-range` i uni qamrab
oladi (`U+02B0-02FF`). Kirill subsetlarida umuman tirnoq glifi yo'q (manba glif
topilmaydi) va ular `unicode-range: U+0400-04FF` bilan cheklangan, shuning uchun
ularga tegilmaydi.

Faqat cmap yozuvi qo'shiladi — glif ko'chirilmaydi, shuning uchun fayl hajmi
deyarli o'zgarmaydi (bir necha bayt).

ISHGA TUSHIRISH
===============
Bu QO'LDA ishga tushiriladigan vosita. Ataylab build zanjiriga (`package.json`,
`prebuild`) qo'shilmagan — yamalgan woff2 fayllar repoga commit qilingan,
shuning uchun `npm run build` uchun `fonttools` bog'liqligi kerak emas. Skript
yamoqni qaytadan hosil qilish va tekshirish uchun (shriftlar yangilansa yoki
yamoq qanday paydo bo'lganini bilish kerak bo'lsa).

    python3 -m venv .venv-fonts
    .venv-fonts/bin/pip install "fonttools[woff]"

    .venv-fonts/bin/python scripts/patch-font-uzbek-glyph.py --check   # tekshirish
    .venv-fonts/bin/python scripts/patch-font-uzbek-glyph.py           # yamash

Skript idempotent: yamalgan faylni qayta yamamaydi (o'tkazib yuboradi).
"""

import argparse
import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit(
        "XATO: fonttools topilmadi.\n"
        '  python3 -m venv .venv-fonts && .venv-fonts/bin/pip install "fonttools[woff]"'
    )

FONT_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"

# Yamaladigan fayllar. Kirill subsetlarida tirnoq glifi yo'q va U+02BB ularning
# `unicode-range` iga kirmaydi — shuning uchun faqat latin.
FONT_GLOB = "*-latin.woff2"

TARGET = 0x02BB  # MODIFIER LETTER TURNED COMMA (ʻ) — `oʻ`, `gʻ`

# Manba glifni izlash tartibi. Birinchi topilgani ishlatiladi.
# U+2018 — asosiy variant, PT Sans oilasining hamma latin subsetida bor.
# U+201B (SINGLE HIGH-REVERSED-9) — bir xil shakl, zaxira variant.
# `quoteleft` — cmap'siz, faqat nom bo'yicha oxirgi zaxira.
SOURCE_CODEPOINTS = (0x2018, 0x201B)
SOURCE_GLYPH_NAME = "quoteleft"


def find_source_glyph(font):
    """U+02BB uchun manba glif nomini qaytaradi: (glyph_name, sabab)."""
    cmap = font.getBestCmap()
    for cp in SOURCE_CODEPOINTS:
        name = cmap.get(cp)
        if name is not None:
            return name, f"U+{cp:04X}"
    if SOURCE_GLYPH_NAME in font.getGlyphOrder():
        return SOURCE_GLYPH_NAME, f"nom: {SOURCE_GLYPH_NAME}"
    return None, None


def patch(path, check_only):
    """Bitta faylni yamaydi. Qaytaradi: True — o'zgardi/yamoq kerak."""
    # lazy=True: faqat cmap ochiladi, qolgan jadvallar xom bayt sifatida o'tadi.
    font = TTFont(path, lazy=True)
    try:
        already = font.getBestCmap().get(TARGET)
        if already is not None:
            print(f"  {path.name}: U+{TARGET:04X} allaqachon bor (-> {already}), o'tkazib yuborildi")
            return False

        source, origin = find_source_glyph(font)
        if source is None:
            sys.exit(
                f"XATO: {path.name} da manba glif topilmadi "
                f"(U+2018, U+201B, '{SOURCE_GLYPH_NAME}' — hech biri yo'q)."
            )

        if check_only:
            print(f"  {path.name}: U+{TARGET:04X} YO'Q — yamoq kerak (manba: {source} <- {origin})")
            return True

        # Hamma Unicode cmap subjadvaliga yozamiz: brauzerlar qaysi birini
        # tanlashi platformaga bog'liq (odatda platID=3/encID=1, lekin
        # platID=0 ham bor).
        written = 0
        for subtable in font["cmap"].tables:
            if subtable.isUnicode():
                subtable.cmap[TARGET] = source
                written += 1
        if written == 0:
            sys.exit(f"XATO: {path.name} da Unicode cmap subjadvali yo'q.")

        before = path.stat().st_size
        font.flavor = "woff2"
        font.save(path)
        after = path.stat().st_size
        print(
            f"  {path.name}: U+{TARGET:04X} -> {source} ({origin}), "
            f"{written} ta cmap subjadvali, {before} -> {after} bayt ({after - before:+d})"
        )
        return True
    finally:
        font.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--check",
        action="store_true",
        help="hech narsa yozmaydi, faqat yamoq kerakligini aytadi (exit 1 — kerak)",
    )
    args = parser.parse_args()

    paths = sorted(FONT_DIR.glob(FONT_GLOB))
    if not paths:
        sys.exit(f"XATO: {FONT_DIR} da '{FONT_GLOB}' mos fayl topilmadi.")

    print(("Tekshirilmoqda" if args.check else "Yamalmoqda") + f": {len(paths)} ta fayl")
    changed = [p for p in paths if patch(p, args.check)]

    if args.check:
        if changed:
            print(f"\n{len(changed)} ta faylda U+{TARGET:04X} yo'q.")
            sys.exit(1)
        print(f"\nHammasida U+{TARGET:04X} bor.")
    else:
        print(f"\nTayyor: {len(changed)} ta fayl yamandi, {len(paths) - len(changed)} ta o'zgarmadi.")


if __name__ == "__main__":
    main()
