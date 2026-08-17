"""Proktoring dalili (`EvidenceSnapshot`) faylini beruvchi YAGONA endpoint.

Dalil rasmlari `MEDIA_ROOT`/Cloudinary'da EMAS (`attempts/storage.py`), ya'ni
ularga na `/media/` URL'i, na Cloudinary havolasi olib bormaydi: nginx'dagi
`location /media/` bloki fayllarni hech qanday tekshiruvsiz, to'g'ridan-to'g'ri
diskdan beradi va u yerda turgan kadr URL'ni topgan HAR KIMGA ochiq bo'lardi.
Bu yerdagi endpoint esa faylni faqat autentifikatsiyadan o'tgan platforma
admini uchun striming qiladi.

Ruxsat AYNAN `IsPlatformAdmin` (foydalanuvchi qarori): markaz egasi/menejeri/
o'qituvchi panellariga dalil rasmlari UMUMAN chiqmaydi — ular sessiya bo'yicha
qaror qabul qilish uchun `cheating_reason` va jonli oqimdan foydalanadi.

Modul `views_admin.py` bilan bir xil sababga ko'ra alohida: `views.py`
allaqachon juda uzun (loyihadagi odat — `views_essay.py`).
"""
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes

from accounts.models import AuditLog
from accounts.permissions import IsPlatformAdmin

from .models import EvidenceSnapshot

# `?kind=` qiymatlari: qaysi kadr so'ralyapti.
KIND_CAMERA = 'camera'
KIND_SCREEN = 'screen'


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_evidence_image(request, evidence_id):
    """GET /api/attempts/admin/evidence/<evidence_id>/?kind=camera|screen

    Bitta dalil kadrini qaytaradi (`image/jpeg`). `kind` berilmasa — kamera
    kadri; `screen` — ekran kadri. Dalil id'lari admin ro'yxatidan keladi
    (`views_admin._session_payload` → `evidence`).

    404 (403 emas) uchta holatda: yozuv yo'q, shu turdagi kadr saqlanmagan
    (masalan ekranini ulashmagan), yoki fayl diskdan yo'qolgan. Uchalasi ham
    admin uchun bir xil ma'noda — "ko'rsatadigan rasm yo'q".

    Kadrni KIM ochgani audit jurnaliga tushadi (pastdagi izoh): ruxsat
    tekshiruvi "faqat admin ko'ra oladi" degan kafolatni beradi, jurnal esa
    "qaysi admin, qachon, kimning kadrini ko'rdi" degan savolga javob beradi
    — biometrik ma'lumot uchun ikkalasi ham kerak.
    """
    kind = (request.query_params.get('kind') or KIND_CAMERA).strip()
    if kind not in (KIND_CAMERA, KIND_SCREEN):
        raise Http404('Noma\'lum kadr turi')

    # `session__user` — audit yozuvining nishoni uchun (pastda). JOIN bitta
    # so'rovda keladi, ya'ni jurnal qo'shimcha so'rov qo'shmaydi.
    snapshot = get_object_or_404(
        EvidenceSnapshot.objects.select_related('session__user'), pk=evidence_id,
    )
    field = snapshot.screen_image if kind == KIND_SCREEN else snapshot.image
    if not field:
        raise Http404('Bu dalilda bunday kadr yo\'q')

    try:
        # Fayl butunlay xotiraga o'qilmaydi — `FileResponse` uni bo'laklab
        # uzatadi va oqim tugagach yopadi.
        handle = field.open('rb')
    except OSError:
        # Fayl diskdan yo'qolgan (retention sweep, disk nosozligi) — DB qatori
        # esa hali turibdi. 500 emas, 404.
        raise Http404('Dalil fayli topilmadi')

    response = FileResponse(handle, content_type='image/jpeg')
    # `inline` — admin panelida `<img>` sifatida ko'rsatiladi.
    response['Content-Disposition'] = (
        f'inline; filename="evidence-{snapshot.pk}-{kind}.jpg"'
    )
    # Shaxsiy/biometrik ma'lumot: brauzer ham, oradagi proksi ham keshlamasin.
    response['Cache-Control'] = 'private, no-store, max-age=0'

    # Ko'rish fakti jurnalga YOZILADI — `admin_user_detail` va
    # `admin_shared_ip_detail` bilan AYNAN bir xil action kodi va `extra.view`
    # diskriminatori orqali. Alohida kod ('admin_evidence_view') qo'shilmadi:
    # "qaysi admin kimning maxfiy ma'lumotini ko'rdi" savoliga javob bitta
    # `action` bo'yicha o'qiladi (jurnal qidiruvi `action__icontains` bilan
    # ishlaydi) va ikkinchi kod o'sha javobni ikkiga bo'lib yuborardi;
    # ACTION_CHOICES yorlig'i ("Maxfiy ma'lumot ko'rildi") kadrga ham to'g'ri
    # keladi, `extra.view` esa turini allaqachon ajratadi ('login_history',
    # 'shared_ip', ...).
    #
    # Yozuv AYNAN shu nuqtada, javob tayyor bo'lgach: yuqoridagi uchala 404
    # ham, `IsPlatformAdmin` qaytaradigan 403 ham bu yergacha yetib kelmaydi —
    # muvaffaqiyatsiz urinish "rasm ko'rildi" degani emas.
    #
    # Nishon — KADRDAGI o'quvchi, dalil qatori emas: jurnal foydalanuvchi
    # bo'yicha o'qiladi ("Batafsil" oynasidagi amallar tarixi,
    # `audit_log_list.target_name` — ikkalasi ham `target_type='User'` ga
    # tayanadi). Dalilning o'zi `extra.snapshot_id` da qoladi.
    AuditLog.log(
        request, 'admin_sensitive_data_view', target=snapshot.session.user,
        extra={
            'view': 'evidence_image',
            'session_id': snapshot.session_id,
            'snapshot_id': snapshot.pk,
            'kind': kind,
        },
    )
    return response
