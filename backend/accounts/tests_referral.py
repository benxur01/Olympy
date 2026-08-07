"""Referral kodini ishlatish (`POST /api/me/referral/use/`) — poyga himoyasi.

Bu endpoint muvaffaqiyatida IKKI hisobga ham coin qo'shadi, coin esa mukofot
do'konida real narsalarga almashtiriladi. Ilgari "kod ishlatilganmi"
tekshiruvi tranzaksiya ichida, lekin `select_for_update()` qulfidan OLDIN
bajarilardi: parallel yuborilgan o'nlab so'rovning HAMMASI tekshiruvdan o'tib
ketardi. M2M `add()` dublikat juftlik uchun xato bermaydi (jimgina no-op),
shuning uchun DB unique cheklovi bu yerda hech narsani to'smasdi — natijada
bitta kod bilan cheksiz coin.

Quyidagi testlar aynan shu xususiyatlarni qotiradi:
  * tekshiruv QULF OLINGANDAN KEYIN bajariladi (poyga simulyatsiyasi);
  * qulflar deadlock bo'lmasligi uchun doimiy (pk) tartibda olinadi;
  * ketma-ket takroriy urinishlar bonus bermaydi;
  * endpoint throttle bilan himoyalangan.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.throttling import SimpleRateThrottle

from accounts.models import ReferralCode
from accounts.views_b2b import _lock_users_in_pk_order, use_referral

User = get_user_model()


class UseReferralRaceTestCase(APITestCase):
    """Bonus qat'iy bir marta beriladi."""

    def setUp(self):
        self.inviter = User.objects.create_user(
            phone='+998907770001', password='InviterPass123', full_name='Taklif qiluvchi',
        )
        self.invited = User.objects.create_user(
            phone='+998907770002', password='InvitedPass123', full_name='Taklif qilingan',
        )
        self.referral = ReferralCode.objects.create(user=self.inviter, code='ABCD1234')
        self.url = reverse('me-referral-use')
        self.client.force_authenticate(user=self.invited)

    def _use(self, code='ABCD1234'):
        return self.client.post(self.url, {'code': code}, format='json')

    def _coins(self):
        self.inviter.refresh_from_db()
        self.invited.refresh_from_db()
        return self.inviter.coins, self.invited.coins

    def test_first_use_gives_bonus_to_both(self):
        """Oddiy oqim buzilmagan: ikkala hisob ham bonus oladi."""
        response = self._use()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['bonus_coins'], 50)
        self.assertEqual(self._coins(), (50, 50))
        self.assertEqual(self.referral.used_by.count(), 1)

    def test_second_use_is_rejected_and_gives_no_extra_coins(self):
        """Ketma-ket ikkinchi urinish 400 va coin o'zgarmaydi."""
        self.assertEqual(self._use().status_code, status.HTTP_200_OK)
        response = self._use()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._coins(), (50, 50))
        self.assertEqual(self.referral.used_by.count(), 1)

    def test_check_runs_after_the_lock_is_taken(self):
        """POYGA SIMULYATSIYASI — bu test eski (buzuq) kodda YIQILADI.

        Haqiqiy parallel oqimni ishonchli takrorlash uchun ikkita DB ulanishi
        va real qator qulfi kerak; test paketi SQLite'da ishlaydi, u yerda
        `select_for_update()` — no-op (Django uni SQLite uchun umuman
        chiqarmaydi), ya'ni thread'li test hech narsani isbotlamaydi va
        beqaror bo'lardi.

        Shuning uchun poygani seam orqali determinallashtiramiz: qulf
        olingan PAYTDA (ya'ni "parallel tranzaksiya endigina commit qildi"
        momentida) kodni allaqachon ishlatilgan qilib qo'yamiz. View qulfdan
        KEYIN qayta tekshirgani uchun buni ko'radi va bonus bermaydi. Eski
        tartibda (tekshiruv → qulf) bu holat umuman aniqlanmasdi va hujumchi
        coin olib ketardi.
        """
        def lock_then_race(user_model, *pks):
            locked = _lock_users_in_pk_order(user_model, *pks)
            self.referral.used_by.add(self.invited)
            return locked

        with patch(
            'accounts.views_b2b._lock_users_in_pk_order',
            side_effect=lock_then_race,
        ) as mocked:
            response = self._use()

        self.assertTrue(mocked.called, 'qulf umuman olinmadi')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._coins(), (0, 0))

    def test_locks_are_taken_in_ascending_pk_order(self):
        """Deadlock himoyasi: qulf tartibi argumentlar tartibiga bog'liq emas.

        Ikki foydalanuvchi bir vaqtda bir-birining kodini ishlatsa, "avval
        o'zim, keyin taklif qiluvchi" tartibi ikki tranzaksiyada teskari
        bo'lib deadlock berardi (Postgres bittasini o'ldiradi → 500). Yagona
        global tartib (pk o'sish bo'yicha) bunga yo'l qo'ymaydi.
        """
        low, high = sorted([self.inviter.pk, self.invited.pk])

        forward = _lock_users_in_pk_order(User, low, high)
        backward = _lock_users_in_pk_order(User, high, low)

        self.assertEqual(list(forward.keys()), [low, high])
        self.assertEqual(list(backward.keys()), [low, high])

    def test_view_locks_both_accounts(self):
        """View ikkala hisobni ham qulflaydi (lost update himoyasi saqlangan)."""
        seen = []

        def record(user_model, *pks):
            seen.append(sorted(set(pks)))
            return _lock_users_in_pk_order(user_model, *pks)

        with patch('accounts.views_b2b._lock_users_in_pk_order', side_effect=record):
            response = self._use()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(seen, [sorted([self.inviter.pk, self.invited.pk])])

    def test_cannot_use_a_second_different_code(self):
        """Bir foydalanuvchi umuman bitta kod ishlata oladi."""
        other = User.objects.create_user(
            phone='+998907770003', password='OtherPass123', full_name='Boshqa',
        )
        ReferralCode.objects.create(user=other, code='WXYZ9999')

        self.assertEqual(self._use().status_code, status.HTTP_200_OK)
        response = self._use(code='WXYZ9999')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        other.refresh_from_db()
        self.assertEqual(other.coins, 0)
        self.assertEqual(self._coins(), (50, 50))

    def test_own_code_is_rejected(self):
        """O'z kodini ishlatish — bonus emas (regressiya himoyasi)."""
        self.client.force_authenticate(user=self.inviter)
        response = self._use()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._coins(), (0, 0))


class UseReferralThrottleTestCase(APITestCase):
    """Endpoint ScopedRateThrottle bilan cheklangan."""

    def setUp(self):
        cache.clear()  # throttle hisoblagichi testlar orasida oqmasin
        self.inviter = User.objects.create_user(
            phone='+998907771001', password='InviterPass123', full_name='Taklif qiluvchi',
        )
        self.user = User.objects.create_user(
            phone='+998907771002', password='UserPass123', full_name='Foydalanuvchi',
        )
        ReferralCode.objects.create(user=self.inviter, code='THRT0001')
        self.url = reverse('me-referral-use')
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        cache.clear()

    def test_throttle_scope_is_referral_use(self):
        self.assertEqual(use_referral.cls.throttle_scope, 'referral_use')

    def test_scope_rate_is_configured(self):
        """settings.py da 'referral_use' scope'i mavjud (test rejimida qiymat oshiriladi)."""
        from django.conf import settings
        self.assertIn(
            'referral_use', settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],
        )

    def test_burst_of_requests_is_throttled(self):
        """Chegaradan oshgan so'rov 429 oladi — poyga oynasini kengaytirib bo'lmaydi.

        Test rejimida barcha rate'lar 10000/min ga ko'tariladi (settings.py),
        shuning uchun scope rate'ini shu test doirasida pasaytiramiz.
        DRF `THROTTLE_RATES` ni sinf atributi sifatida ushlab turadi —
        `override_settings` unga ta'sir qilmaydi, shuning uchun to'g'ridan-
        to'g'ri shu dict'ni patch qilamiz.
        """
        with patch.dict(SimpleRateThrottle.THROTTLE_RATES, {'referral_use': '2/hour'}):
            first = self.client.post(self.url, {'code': 'NOPE0000'}, format='json')
            second = self.client.post(self.url, {'code': 'NOPE0000'}, format='json')
            third = self.client.post(self.url, {'code': 'THRT0001'}, format='json')

        self.assertEqual(first.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(second.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(third.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        # Throttle bloklagan so'rov coin bermagan.
        self.user.refresh_from_db()
        self.assertEqual(self.user.coins, 0)
