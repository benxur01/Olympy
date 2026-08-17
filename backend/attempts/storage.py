"""Proktoring dalillari uchun yopiq (web'ga chiqmaydigan) fayl storage'i.

`STORAGES['default']` dan (Cloudinary yoki `MEDIA_ROOT` ustidagi
`FileSystemStorage`) BUTUNLAY mustaqil: dalil fayllari `settings.
EVIDENCE_MEDIA_ROOT` ichida turadi, u esa nginx bera oladigan hech qanday
katalog ostida emas (`/media/` bloki autentifikatsiyasiz ishlaydi —
`nginx/nginx.conf`). Faylga yagona yo'l — `attempts/views_evidence.py` dagi
platforma-admin endpointi.
"""
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils.functional import cached_property


class EvidenceStorage(FileSystemStorage):
    """`EVIDENCE_MEDIA_ROOT` ichiga yozadigan, URL BERMAYDIGAN storage.

    `location`/`base_url` konstruktorga ATAYIN uzatilmaydi — aks holda ular
    `deconstruct()` orqali migratsiya fayliga absolyut yo'l bo'lib tushardi va
    har muhitda (dev/Docker) noto'g'ri katalogga ishora qilardi. O'rniga ikkala
    qiymat ham shu yerda, sozlamadan o'qiladi.
    """

    @cached_property
    def base_location(self):
        return settings.EVIDENCE_MEDIA_ROOT

    @cached_property
    def base_url(self):
        # None — `FileSystemStorage.url()` "This file is not accessible via a
        # URL" xatosini ko'taradi. Ota-klass default'i `MEDIA_URL` bo'lardi,
        # ya'ni `snapshot.image.url` jimgina `/media/evidence/...` qaytarib,
        # panelga nginx to'g'ridan-to'g'ri beradigan (himoyasiz) havolani
        # chiqarish xavfi tug'ilardi. Bu yerda u xato bilan to'xtaydi.
        return None

    def _clear_cached_properties(self, setting, **kwargs):
        """`override_settings(EVIDENCE_MEDIA_ROOT=...)` ni ham eshitadi.

        Ota-klass faqat `MEDIA_ROOT`/`MEDIA_URL`/`FILE_UPLOAD_PERMISSIONS` ga
        reaksiya qiladi; bizning katalog boshqa sozlamadan kelgani uchun uni
        alohida qo'shamiz (aks holda testdagi vaqtinchalik katalog e'tiborga
        olinmay, fayllar haqiqiy `EVIDENCE_MEDIA_ROOT` ga yozilardi).
        """
        super()._clear_cached_properties(setting, **kwargs)
        if setting == 'EVIDENCE_MEDIA_ROOT':
            self.__dict__.pop('base_location', None)
            self.__dict__.pop('location', None)


# Model maydonlari shu YAGONA instance'ga tayanadi.
evidence_storage = EvidenceStorage()
