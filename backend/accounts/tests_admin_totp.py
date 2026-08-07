"""Django admin login'ida 2FA (TOTP) majburiyligi.

Audit topilmasi: `/olympy-mgmt-2025/` standart admin login'i `ModelBackend`
orqali FAQAT parolni tekshirardi — API'da 2FA yoqilgan staff hisobiga admin
panelidan bir parol bilan kirish mumkin edi. Bu testlar shu regressiyani
qaytmasligini ushlab turadi (tuzatish: `accounts/admin_site.py`).
"""
import pyotp
from axes.models import AccessAttempt
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse


User = get_user_model()

ADMIN_PASSWORD = 'AdminStrongPass123'


# `SECURE_SSL_REDIRECT` productionda yoqiq (`settings.py`: `not DEBUG`), test
# mijozi esa oddiy HTTP so'rov yuboradi — o'chirilmasa HAR BIR so'rov login
# view'iga yetib bormasdan 301 bilan HTTPS'ga qaytariladi va testlar aslida
# hech narsani tekshirmasdi.
@override_settings(
    SECURE_SSL_REDIRECT=False,
    # Admin shabloni `{% static %}` bilan o'z CSS'ini chaqiradi, production
    # staticfiles backend'i esa `CompressedManifestStaticFilesStorage` — u
    # `collectstatic` yaratadigan manifestni talab qiladi va usiz login
    # sahifasini RENDER qilishning o'zi ValueError beradi. Testlarda
    # manifestsiz backend yetarli (biz static fayllarni emas, forma mantiqini
    # tekshiryapmiz).
    STORAGES={
        'default': {
            'BACKEND': 'django.core.files.storage.FileSystemStorage',
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    },
)
class AdminTOTPLoginTests(TestCase):
    def setUp(self):
        # `verify_totp_code` replay himoyasi cache'da yashaydi. TestCase har
        # testdan keyin DB'ni orqaga qaytaradi va pk qiymatlari qayta
        # ishlatiladi — cache tozalanmasa oldingi testning "ishlatilgan step"
        # yozuvi keyingi testning to'g'ri kodini rad etardi. Bu yerda axes
        # hisoblagichlari ham tozalanadi.
        cache.clear()
        self.login_url = reverse('admin:login')

        self.secret = pyotp.random_base32()
        self.totp_admin = User.objects.create_superuser(
            phone='+998901110001', password=ADMIN_PASSWORD, full_name='TOTP Admin',
        )
        self.totp_admin.totp_secret = self.secret
        self.totp_admin.totp_enabled = True
        self.totp_admin.save(update_fields=['encrypted_totp_secret', 'totp_enabled'])

        self.plain_admin = User.objects.create_superuser(
            phone='+998901110002', password=ADMIN_PASSWORD, full_name='Plain Admin',
        )

    # ── yordamchilar ────────────────────────────────────────────────────────
    def _login(self, user, password=ADMIN_PASSWORD, totp_code=None):
        data = {'username': user.normalized_phone, 'password': password}
        if totp_code is not None:
            data['totp_code'] = totp_code
        return self.client.post(self.login_url, data)

    def _current_code(self):
        return pyotp.TOTP(self.secret).now()

    def _is_authenticated(self):
        return '_auth_user_id' in self.client.session

    def _form_errors(self, response):
        form = response.context['form']
        return [str(e) for e in form.non_field_errors()]

    # ── forma ───────────────────────────────────────────────────────────────
    def test_login_page_renders_totp_field(self):
        """Shablon almashtirilgan: kod maydoni sahifada bor.

        Maydon chizilmasa 2FA yoqilgan admin kodni umuman kirita olmasdi.
        """
        response = self.client.get(self.login_url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'name="totp_code"')

    # ── 2FA yoqilgan hisob ──────────────────────────────────────────────────
    def test_totp_user_rejected_without_code(self):
        response = self._login(self.totp_admin)
        self.assertEqual(response.status_code, 200)  # forma qayta ko'rsatiladi
        self.assertFalse(self._is_authenticated())

    def test_totp_user_rejected_with_wrong_code(self):
        response = self._login(self.totp_admin, totp_code='000000')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self._is_authenticated())

    def test_totp_user_accepted_with_correct_code(self):
        response = self._login(self.totp_admin, totp_code=self._current_code())
        self.assertEqual(response.status_code, 302)
        self.assertTrue(self._is_authenticated())
        self.assertEqual(
            int(self.client.session['_auth_user_id']), self.totp_admin.pk,
        )
        # Haqiqatan ham admin paneli ochiladi (nafaqat sessiya yozildi).
        index = self.client.get(reverse('admin:index'))
        self.assertEqual(index.status_code, 200)

    def test_totp_code_cannot_be_replayed(self):
        """Bitta kod ikki marta ishlamaydi — API login'i bilan bir xil himoya."""
        code = self._current_code()
        first = self._login(self.totp_admin, totp_code=code)
        self.assertEqual(first.status_code, 302)
        self.assertTrue(self._is_authenticated())

        self.client.logout()
        second = self._login(self.totp_admin, totp_code=code)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(self._is_authenticated())

    def test_totp_failure_error_is_indistinguishable_from_wrong_password(self):
        """Xato xabari "parol to'g'ri edi" ma'lumotini sizdirmasligi kerak."""
        wrong_password = self._login(self.plain_admin, password='NotThePassword1')
        wrong_code = self._login(self.totp_admin, totp_code='000000')
        self.assertFalse(self._is_authenticated())
        self.assertEqual(
            self._form_errors(wrong_password), self._form_errors(wrong_code),
        )

    def test_failed_totp_is_counted_by_axes(self):
        """django-axes lockout hisoblagichi 2FA bosqichini ham ko'radi.

        Bu bosqichda `authenticate()` MUVAFFAQIYATLI tugagan, ya'ni axes
        signalni o'z-o'zidan olmaydi — u qo'lda yuborilmasa kodni cheksiz
        taxmin qilish mumkin bo'lardi.
        """
        before = AccessAttempt.objects.count()
        self._login(self.totp_admin, totp_code='000000')
        self.assertEqual(AccessAttempt.objects.count(), before + 1)

    # ── 2FA yoqilmagan hisob ────────────────────────────────────────────────
    def test_non_totp_user_logs_in_with_password_only(self):
        response = self._login(self.plain_admin)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(self._is_authenticated())
        self.assertEqual(
            int(self.client.session['_auth_user_id']), self.plain_admin.pk,
        )

    def test_non_totp_user_unaffected_by_stray_code(self):
        """2FA yoqilmagan hisobda tasodifan kiritilgan kod login'ni buzmaydi."""
        response = self._login(self.plain_admin, totp_code='123456')
        self.assertEqual(response.status_code, 302)
        self.assertTrue(self._is_authenticated())

    def test_wrong_password_still_rejected(self):
        response = self._login(self.plain_admin, password='NotThePassword1')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self._is_authenticated())

    # ── ADMIN_REQUIRE_TOTP (opt-in majburlash) ──────────────────────────────
    @override_settings(ADMIN_REQUIRE_TOTP=True)
    def test_require_totp_flag_blocks_admin_without_2fa(self):
        response = self._login(self.plain_admin)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self._is_authenticated())

    @override_settings(ADMIN_REQUIRE_TOTP=True)
    def test_require_totp_flag_allows_admin_with_2fa(self):
        response = self._login(self.totp_admin, totp_code=self._current_code())
        self.assertEqual(response.status_code, 302)
        self.assertTrue(self._is_authenticated())
