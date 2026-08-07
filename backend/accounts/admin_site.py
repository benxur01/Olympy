"""Django admin login'i uchun 2FA (TOTP) talabi.

MUAMMO (audit): `/olympy-mgmt-2025/` standart `AdminSite` login'idan
foydalanardi, u esa `ModelBackend` orqali FAQAT parolni tekshiradi
(`check_password`) — `user.totp_enabled` / `user.totp_secret` umuman
qaralmasdi. Ya'ni API login'ida 2FA yoqilgan staff hisobiga admin panelidan
BIR PAROL bilan kirish mumkin edi: 2FA butunlay chetlab o'tilardi.

YECHIM: `AdminSite.login_form` almashtiriladi. Parol to'g'ri bo'lgandan keyin,
agar foydalanuvchida 2FA yoqilgan bo'lsa, qo'shimcha bir martalik kod talab
qilinadi. Kod API login'i bilan AYNAN BIR XIL yo'ldan tekshiriladi —
`accounts.utils.verify_totp_code` (`accounts/views.py` `login` ham shuni
chaqiradi), shuning uchun replay himoyasi (bitta kod ikki marta ishlatilmaydi)
ikkala oqimda ham bir xil va bir joyda turadi.

NEGA `AdminConfig.default_site` (monkey-patch emas): barcha modellar
`@admin.register(...)` dekoratori bilan `django.contrib.admin.sites.site`
LAZY proxy'siga ro'yxatdan o'tadi. `default_site` almashtirilganda o'sha proxy
BIZNING nusxamizga yechiladi — hech bir ro'yxatdan o'tish yo'qolmaydi va
`olympy_api/urls.py` dagi `admin.site.urls` o'zgarishsiz qoladi.
"""
import logging

from django import forms
from django.conf import settings
from django.contrib.admin import AdminSite
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth.signals import user_login_failed

from .utils import verify_totp_code


security_logger = logging.getLogger('security')


class AdminTOTPAuthenticationForm(AdminAuthenticationForm):
    """Admin login formasi + ixtiyoriy bir martalik kod maydoni.

    Maydon HAR DOIM ko'rsatiladi va `required=False`: agar u faqat 2FA yoqilgan
    hisoblarda paydo bo'lganida, formaning o'zi "bu telefon raqamda 2FA bor"
    degan ma'lumotni anonim tashrifchiga sizdirardi. 2FA yoqilmagan
    foydalanuvchi uni shunchaki bo'sh qoldiradi.
    """

    totp_code = forms.CharField(
        label='2FA kodi',
        required=False,
        max_length=8,
        strip=True,
        widget=forms.TextInput(attrs={
            'autocomplete': 'one-time-code',
            'inputmode': 'numeric',
            'autocapitalize': 'off',
            'spellcheck': 'false',
        }),
        help_text="2FA yoqilgan hisoblar uchun majburiy; aks holda bo'sh qoldiring.",
    )

    def clean(self):
        # `super()` parolni tekshiradi (`authenticate`) va `is_staff` shartini
        # qo'yadi (`AdminAuthenticationForm.confirm_login_allowed`). Parol
        # noto'g'ri bo'lsa u yerdayoq ValidationError ko'tariladi va bu yergacha
        # yetib kelinmaydi (django-axes ham o'sha oqimda hisoblab boradi).
        cleaned_data = super().clean()
        user = self.user_cache
        if user is None:
            return cleaned_data

        code = (self.cleaned_data.get('totp_code') or '').strip()
        if getattr(user, 'totp_enabled', False) and getattr(user, 'totp_secret', ''):
            if not code or not verify_totp_code(user, code):
                self._reject_totp('wrong, missing or reused 2FA code')
        elif getattr(settings, 'ADMIN_REQUIRE_TOTP', False):
            # Ixtiyoriy majburlash (default O'CHIQ): 2FA sozlamagan staff
            # hisobi admin paneliga umuman kira olmaydi. Contabo migratsiyasi
            # paytida hech kim qulf ostida qolmasligi uchun bu flag ataylab
            # opt-in — batafsil izoh settings.py dagi ADMIN_REQUIRE_TOTP da.
            self._reject_totp('2FA not enabled (ADMIN_REQUIRE_TOTP)')
        return cleaned_data

    def _reject_totp(self, reason):
        """2FA bosqichini rad etadi: log + axes hisoblagichi + umumiy xato."""
        user = self.user_cache
        security_logger.warning(
            'admin login failed (%s) user_id=%s', reason, getattr(user, 'pk', None),
        )

        # django-axes muvaffaqiyatsiz urinishlarni `user_login_failed` signali
        # orqali sanaydi. Bu nuqtada `authenticate()` MUVAFFAQIYATLI tugagan
        # (parol to'g'ri), ya'ni signal o'z-o'zidan yuborilmaydi — qo'lda
        # yubormasak, 2FA kodini cheksiz taxmin qilish mumkin bo'lardi va
        # lockout hech qachon ishlamasdi. `request` MAJBURIY: usiz axes
        # urinishni qaysi IP'ga yozishni bilmaydi.
        username = self.cleaned_data.get('username') or ''
        user_login_failed.send(
            sender=__name__,
            # 'username' — axes'ning standart AXES_USERNAME_FORM_FIELD qiymati;
            # ikkinchi kalit AXES_USERNAME_FORM_FIELD model maydoniga
            # sozlangan holat uchun (ikkalasi ham bir xil qiymatni saqlaydi).
            credentials={
                'username': username,
                self.username_field.name: username,
            },
            request=self.request,
        )

        # Hech qanday holatda `get_user()` bu foydalanuvchini qaytarmasin.
        self.user_cache = None

        # Xato xabari parol xatosi bilan AYNAN BIR XIL. Aks holda javob
        # "parol to'g'ri edi, faqat kod xato" degan ma'lumotni sizdirardi va
        # hujumchi 2FA'ni oracle sifatida ishlatib parol brute-force natijasini
        # o'qib olardi.
        raise self.get_invalid_login_error()


class OlympyAdminSite(AdminSite):
    """Standart admin site + 2FA'li login formasi va shu formaga mos shablon."""

    login_form = AdminTOTPAuthenticationForm
    # Django'ning `admin/login.html` shabloni faqat `username` va `password`
    # maydonlarini chizadi — qo'shilgan `totp_code` ko'rinmasdi. Shu sababli
    # o'z shablonimiz (u Django shablonini `extends` qiladi va faqat forma
    # blokini qayta yozadi).
    login_template = 'admin/login_totp.html'
