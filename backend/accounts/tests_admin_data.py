"""Admin paneli ma'lumot to'liqligi, xavf darajasi va sezgir ma'lumot auditi.

Uchta bog'liq mavzu bir faylda, chunki uchalasi ham BITTA savolga javob
beradi: "admin ro'yxatga qarab qaror qila oladimi, va o'sha qarash izsiz
qoladimi".

1. `AdminUserListSerializer` — `deleted_at`, Telegram tafsiloti va blok
   sabablari endi ro'yxat javobida. Muhim salbiy test ham shu yerda: bu
   maydonlar `UserSerializer` ga TUSHMASLIGI kerak (u markaz xodimlariga
   ham qaytariladi).
2. `risk_tier` — ro'yxatda arzon SQL bilan, "Batafsil" oynasidagi to'liq
   `risk_level` bilan ziddiyatsiz.
3. `admin_sensitive_data_view` — telefon/OTP/kirish tarixini KIM ko'rgani
   audit jurnalida qoladi.

Qurilma bo'yicha ko'p-hisob aniqlash (`shared-device`) ham shu yerda:
u `shared-ip` ning to'ldiruvchisi va bir xil audit qoidasiga bo'ysunadi.
"""
from datetime import timedelta

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import AuditLog, LoginEvent, User
from accounts.serializers import AdminUserListSerializer, UserSerializer
from attempts.models import TestAttempt, TestSession
from centers.models import EducationCenter
from moderation.models import ModerationFlag
from olympiads.models import Olympiad

SENSITIVE_VIEW_ACTION = 'admin_sensitive_data_view'


class AdminDataTestMixin:
    """Umumiy fixture: platforma admini, markaz va olimpiada yasovchi yordamchi."""

    def make_admin(self, suffix='0001'):
        admin = User.objects.create_user(
            phone=f'+99890777{suffix}', password='AdminPass123', full_name='Platforma Admin',
        )
        admin.is_platform_admin = True
        admin.save(update_fields=['is_platform_admin'])
        return admin

    def make_user(self, suffix, full_name='Foydalanuvchi', **extra):
        return User.objects.create_user(
            phone=f'+99890888{suffix}', password='UserPass123', full_name=full_name, **extra,
        )

    def make_olympiad(self, title='Matematika'):
        if not getattr(self, '_center', None):
            self._center = EducationCenter.objects.create(
                name='Registon markazi', owner=self.admin,
            )
        return Olympiad.objects.create(
            center=self._center,
            title=title,
            subject='Matematika',
            duration_minutes=30,
            status=Olympiad.STATUS_ACTIVE,
        )

    def disqualify(self, user, count=1):
        """`count` ta diskvalifikatsiya qilingan urinish (har biri boshqa olimpiada:
        `TestAttempt` da (user, olympiad) unique)."""
        for i in range(count):
            TestAttempt.objects.create(
                user=user, olympiad=self.make_olympiad(f'Olimpiada {user.id}-{i}'),
                score=0, disqualified=True,
            )


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminUserListFieldsTestCase(AdminDataTestMixin, APITestCase):
    """GET /api/admin/users/ — ro'yxatdagi ma'lumot to'liqligi (Finding E)."""

    def setUp(self):
        self.admin = self.make_admin()
        self.url = reverse('admin-users-list')
        self.client.force_authenticate(user=self.admin)

    def test_list_exposes_admin_only_fields(self):
        user = self.make_user('1001', full_name='Ali Valiyev')
        user.block_reason = 'Qoidabuzarlik'
        user.blocked_until = timezone.now() + timedelta(days=3)
        user.exam_block_reason = 'Imtihonda ko‘chirish'
        user.telegram_chat_id = '12345'
        user.telegram_user_id = '67890'
        user.telegram_linked_at = timezone.now()
        user.is_active = False
        user.save()

        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        row = res.data['results'][0]
        self.assertEqual(row['block_reason'], 'Qoidabuzarlik')
        self.assertIsNotNone(row['blocked_until'])
        self.assertEqual(row['exam_block_reason'], 'Imtihonda ko‘chirish')
        self.assertEqual(row['telegram_chat_id'], '12345')
        self.assertEqual(row['telegram_user_id'], '67890')
        self.assertIsNotNone(row['telegram_linked_at'])
        self.assertIn('deleted_at', row)
        self.assertIn('risk_tier', row)

    def test_soft_deleted_user_is_distinguishable_from_blocked_one(self):
        """Finding E ning o'zagi: ikkalasi ham `is_active=False`, lekin biri
        foydalanuvchining O'Z qarori (grace ichida tiklanadi), ikkinchisi —
        admin bloki. Busiz support xodimi ularni farqlay olmasdi."""
        deleted = self.make_user('1002', full_name='O‘chirgan')
        deleted.is_active = False
        deleted.deleted_at = timezone.now()
        deleted.save()
        blocked = self.make_user('1003', full_name='Bloklangan')
        blocked.is_active = False
        blocked.block_reason = 'Spam'
        blocked.save()

        res = self.client.get(self.url)
        rows = {r['id']: r for r in res.data['results']}
        self.assertIsNotNone(rows[deleted.id]['deleted_at'])
        self.assertIsNone(rows[blocked.id]['deleted_at'])
        self.assertFalse(rows[deleted.id]['is_active'])
        self.assertFalse(rows[blocked.id]['is_active'])

    def test_admin_only_fields_are_absent_from_plain_user_serializer(self):
        """XAVFSIZLIK: `UserSerializer` markaz egasi/menejeriga ham
        qaytariladi (`centers/views.py`) — platforma admini yozgan blok
        sababi yoki Telegram identifikatori u yerga chiqmasligi kerak."""
        user = self.make_user('1004')
        plain = UserSerializer(user).data
        for field in ('deleted_at', 'block_reason', 'blocked_until', 'exam_block_reason',
                      'telegram_chat_id', 'telegram_user_id', 'telegram_linked_at',
                      'risk_tier'):
            self.assertNotIn(field, plain)
        # Telegram holati markaz xodimiga faqat boolean sifatida ko'rinadi.
        self.assertIn('telegram_linked', plain)

    def test_admin_serializer_fields_are_read_only(self):
        """Serializer faqat OUTPUT uchun: kelajakda tasodifan write
        endpoint'ga ulansa ham blok holatini tashqaridan yozib bo'lmasin."""
        fields = AdminUserListSerializer().fields
        for name in ('deleted_at', 'block_reason', 'blocked_until', 'exam_block_reason',
                     'telegram_chat_id', 'telegram_user_id', 'telegram_linked_at', 'risk_tier'):
            self.assertTrue(fields[name].read_only, f'{name} read-only bo‘lishi kerak')

    def test_parent_serializer_field_list_is_not_mutated(self):
        """Subklass `Meta.fields` ni JOYIDA o'zgartirmasligi kerak — aks holda
        yangi maydonlar butun loyihadagi `UserSerializer` ga ham tarqardi."""
        self.assertNotIn('deleted_at', UserSerializer.Meta.fields)
        self.assertNotIn('block_reason', UserSerializer.Meta.read_only_fields)

    def test_list_query_count_does_not_grow_with_users(self):
        """N+1 qoidasi: `risk_tier` bitta SQL ifodasi (annotatsiya), shuning
        uchun 20 ta qo'shimcha foydalanuvchi so'rovlar sonini oshirmaydi.
        `compute_user_risk_profile` ro'yxatda ishlatilsa har qatorga ~6 ta
        so'rov qo'shilardi."""
        for i in range(3):
            self.make_user(f'20{i:02d}')
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        baseline = len(ctx)

        for i in range(20):
            self.make_user(f'21{i:02d}')
        # Chegara oldindan yozib qo'yilgan son emas, aynan kichik to'plamdagi
        # o'lchov: Django versiyasi so'rovlar sonini o'zgartirsa test emas,
        # faqat baseline suriladi.
        with self.assertNumQueries(baseline):
            res = self.client.get(self.url)
        self.assertEqual(res.data['count'], 23)


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminUserDetailFieldsTestCase(AdminDataTestMixin, APITestCase):
    """GET /api/admin/users/<id>/ — "Batafsil" oynasidagi qo'shimcha maydonlar."""

    def setUp(self):
        self.admin = self.make_admin()
        self.user = self.make_user('3001', full_name='Vali Aliyev')
        self.url = reverse('admin-user-detail', args=[self.user.id])
        self.client.force_authenticate(user=self.admin)

    def test_detail_contains_soft_delete_and_telegram_details(self):
        self.user.deleted_at = timezone.now()
        self.user.is_active = False
        self.user.telegram_chat_id = '55555'
        self.user.telegram_user_id = '66666'
        self.user.telegram_linked_at = timezone.now()
        self.user.save()

        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res.data['deleted_at'])
        self.assertEqual(res.data['telegram_chat_id'], '55555')
        self.assertEqual(res.data['telegram_user_id'], '66666')
        self.assertIsNotNone(res.data['telegram_linked_at'])

    def test_detail_empty_telegram_fields_are_null_not_empty_string(self):
        res = self.client.get(self.url)
        self.assertIsNone(res.data['deleted_at'])
        self.assertIsNone(res.data['telegram_chat_id'])
        self.assertIsNone(res.data['telegram_user_id'])
        self.assertIsNone(res.data['telegram_linked_at'])

    def test_detail_still_returns_full_risk_profile(self):
        """To'liq `risk_score`/`risk_factors` faqat detalda qoladi (ro'yxatda
        u har qatorga ~6 so'rov bo'lardi)."""
        res = self.client.get(self.url)
        self.assertIn('risk_score', res.data)
        self.assertIn('risk_level', res.data)
        self.assertIn('risk_factors', res.data)

    def test_unknown_user_is_404(self):
        res = self.client.get(reverse('admin-user-detail', args=[999999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminUsersExportColumnsTestCase(AdminDataTestMixin, APITestCase):
    """GET /api/admin/users/export/ — CSV ustunlari ro'yxat bilan bir xil
    to'plamni qamraydi (serializer emas: eksportda prefetch yo'q)."""

    def setUp(self):
        self.admin = self.make_admin()
        self.url = reverse('admin-users-export')
        self.client.force_authenticate(user=self.admin)

    def _text(self, res):
        return res.content.decode('utf-8-sig')

    def test_headers_include_new_columns(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        header = self._text(res).splitlines()[0]
        for column in ('Blok sababi', 'Blok muddati', "O'chirilgan",
                       'Imtihon taqiqi sababi', 'Telegram chat ID',
                       'Telegram user ID', 'Telegram ulangan'):
            self.assertIn(column, header)

    def test_soft_deleted_row_status_differs_from_blocked_row(self):
        deleted = self.make_user('4001', full_name='Ochirgan Hisob')
        deleted.is_active = False
        deleted.deleted_at = timezone.now()
        deleted.save()
        blocked = self.make_user('4002', full_name='Bloklangan Hisob')
        blocked.is_active = False
        blocked.block_reason = 'Spam yubordi'
        blocked.save()

        lines = self._text(self.client.get(self.url)).splitlines()
        deleted_row = next(line for line in lines if 'Ochirgan Hisob' in line)
        blocked_row = next(line for line in lines if 'Bloklangan Hisob' in line)
        self.assertIn("O'chirilgan", deleted_row)
        self.assertIn('Bloklangan', blocked_row)
        self.assertIn('Spam yubordi', blocked_row)

    def test_export_reads_new_columns_without_extra_queries(self):
        """Yangi ustunlar `.only(...)` ro'yxatiga qo'shilgan — aks holda har
        qator uchun deferred maydon SELECT'i ketardi (5000 qator = 5000 so'rov)."""
        for i in range(3):
            self.make_user(f'41{i:02d}')
        with CaptureQueriesContext(connection) as ctx:
            self.client.get(self.url)
        baseline = len(ctx)
        for i in range(10):
            self.make_user(f'42{i:02d}')
        with self.assertNumQueries(baseline):
            self.client.get(self.url)


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminUserRiskTierTestCase(AdminDataTestMixin, APITestCase):
    """Ro'yxatdagi `risk_tier` va `?risk=` filtri (Feature-1)."""

    def setUp(self):
        self.admin = self.make_admin()
        self.url = reverse('admin-users-list')
        self.client.force_authenticate(user=self.admin)

    def _tier(self, user):
        res = self.client.get(self.url)
        rows = {r['id']: r for r in res.data['results']}
        return rows[user.id]['risk_tier']

    def test_clean_user_is_low_risk(self):
        user = self.make_user('5001')
        self.assertEqual(self._tier(user), 'past')

    def test_single_disqualification_stays_low(self):
        # min(50, 1*25) = 25 → 'past' ning yuqori chegarasi.
        user = self.make_user('5002')
        self.disqualify(user, 1)
        self.assertEqual(self._tier(user), 'past')

    def test_two_disqualifications_reach_medium(self):
        # min(50, 2*25) = 50 → "o'rta".
        user = self.make_user('5003')
        self.disqualify(user, 2)
        self.assertEqual(self._tier(user), "o'rta")

    def test_exam_ban_adds_twenty_points(self):
        # 50 + 20 = 70 → 'yuqori'.
        user = self.make_user('5004')
        self.disqualify(user, 2)
        user.exam_block_reason = 'Ko‘chirish'
        user.save(update_fields=['exam_block_reason'])
        self.assertEqual(self._tier(user), 'yuqori')

    def test_expired_exam_ban_does_not_count(self):
        """`is_exam_blocked` property'si bilan bir xil qoida: muddati o'tgan
        taqiq faol emas."""
        user = self.make_user('5005')
        self.disqualify(user, 2)
        user.exam_block_reason = 'Eski taqiq'
        user.exam_blocked_until = timezone.now() - timedelta(days=1)
        user.save(update_fields=['exam_block_reason', 'exam_blocked_until'])
        self.assertEqual(self._tier(user), "o'rta")

    def test_moderation_flag_adds_ten_points(self):
        user = self.make_user('5006')
        ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_WARNING_THRESHOLD,
            target_type='user',
            target_id=user.id,
            reason='Ko‘p ogohlantirish',
        )
        # Faqat bayroq: 10 ball — hali 'past'.
        self.assertEqual(self._tier(user), 'past')
        self.disqualify(user, 2)
        user.exam_block_reason = 'Taqiq'
        user.save(update_fields=['exam_block_reason'])
        # 50 + 20 + 10 = 80 → 'yuqori' ning yuqori chegarasi.
        self.assertEqual(self._tier(user), 'yuqori')

    def test_list_tier_matches_detail_risk_level(self):
        """Ro'yxat va "Batafsil" oynasi bir xil so'z bilan gapirishi kerak:
        arzon signallar to'plamida ikkala hisob-kitob aynan bir xil ball
        beradi (ro'yxat qimmat signallarni O'TKAZIB YUBORADI, ya'ni hech
        qachon xavfni oshirib ko'rsatmaydi)."""
        user = self.make_user('5007')
        self.disqualify(user, 2)
        user.exam_block_reason = 'Taqiq'
        user.save(update_fields=['exam_block_reason'])
        detail = self.client.get(reverse('admin-user-detail', args=[user.id]))
        self.assertEqual(self._tier(user), detail.data['risk_level'])

    def test_risk_filter_supports_every_tier(self):
        clean = self.make_user('5101')
        medium = self.make_user('5102')
        self.disqualify(medium, 2)
        high = self.make_user('5103')
        self.disqualify(high, 2)
        high.exam_block_reason = 'Taqiq'
        high.save(update_fields=['exam_block_reason'])

        def ids(**params):
            res = self.client.get(self.url, params)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            return {r['id'] for r in res.data['results']}

        self.assertEqual(ids(risk='past'), {clean.id})
        self.assertEqual(ids(risk="o'rta"), {medium.id})
        self.assertEqual(ids(risk='yuqori'), {high.id})
        self.assertEqual(ids(risk='kritik'), set())
        # `all` va bo'sh qiymat — filtrsiz.
        self.assertEqual(ids(risk='all'), {clean.id, medium.id, high.id})
        self.assertEqual(ids(), {clean.id, medium.id, high.id})

    def test_legacy_high_alias_is_still_accepted(self):
        """Panelning avvalgi yagona qiymati (`?risk=high`) ishlashda davom
        etadi, lekin endi ko'rsatilayotgan `risk_tier` bilan mos keladi."""
        high = self.make_user('5201')
        self.disqualify(high, 2)
        high.exam_block_reason = 'Taqiq'
        high.save(update_fields=['exam_block_reason'])
        self.make_user('5202')
        res = self.client.get(self.url, {'risk': 'high'})
        self.assertEqual([r['id'] for r in res.data['results']], [high.id])

    def test_unknown_risk_value_is_ignored(self):
        user = self.make_user('5301')
        res = self.client.get(self.url, {'risk': 'nonsense'})
        self.assertEqual([r['id'] for r in res.data['results']], [user.id])

    def test_risk_filter_works_on_csv_export_too(self):
        """Eksport queryset'ida annotatsiya yo'q — filtr uni o'zi qo'shishi
        kerak, aks holda `?risk=` bilan eksport FieldError bilan yiqilardi."""
        risky = self.make_user('5401', full_name='Xavfli Hisob')
        self.disqualify(risky, 2)
        self.make_user('5402', full_name='Toza Hisob')
        res = self.client.get(reverse('admin-users-export'), {'risk': "o'rta"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        text = res.content.decode('utf-8-sig')
        self.assertIn('Xavfli Hisob', text)
        self.assertNotIn('Toza Hisob', text)


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminSensitiveDataAuditTestCase(AdminDataTestMixin, APITestCase):
    """Sezgir ma'lumotni KO'RISH audit jurnaliga tushadi (Finding F)."""

    def setUp(self):
        self.admin = self.make_admin()
        self.user = self.make_user('6001', full_name='Kuzatilayotgan')
        self.client.force_authenticate(user=self.admin)

    def _entries(self):
        return AuditLog.objects.filter(action=SENSITIVE_VIEW_ACTION)

    def test_user_detail_view_is_logged(self):
        self.client.get(reverse('admin-user-detail', args=[self.user.id]))
        entry = self._entries().get()
        self.assertEqual(entry.actor_id, self.admin.id)
        self.assertEqual(entry.target_id, self.user.id)
        self.assertEqual(entry.target_type, 'User')
        self.assertEqual(entry.extra['view'], 'user_detail')

    def test_login_history_view_is_logged(self):
        LoginEvent.objects.create(user=self.user, ip_address='10.0.0.1', user_agent='Test')
        self.client.get(reverse('admin-user-login-history', args=[self.user.id]))
        entry = self._entries().get()
        self.assertEqual(entry.target_id, self.user.id)
        self.assertEqual(entry.target_type, 'User')
        self.assertEqual(entry.extra['view'], 'login_history')

    def test_shared_ip_detail_view_is_logged(self):
        LoginEvent.objects.create(user=self.user, ip_address='10.0.0.7', user_agent='Test')
        self.client.get(reverse('admin-shared-ip-detail', args=['10.0.0.7']))
        entry = self._entries().get()
        # Nishon model obyekti emas — tekshirilgan manzil `extra` da.
        self.assertIsNone(entry.target_id)
        self.assertEqual(entry.extra['view'], 'shared_ip')
        self.assertEqual(entry.extra['ip_address'], '10.0.0.7')
        self.assertEqual(entry.extra['accounts'], 1)

    def test_shared_device_detail_view_is_logged(self):
        olympiad = self.make_olympiad('Audit uchun')
        TestSession.objects.create(
            user=self.user, olympiad=olympiad, last_device_id='dev-abc',
        )
        self.client.get(reverse('admin-shared-device-detail', args=['dev-abc']))
        entry = self._entries().get()
        self.assertEqual(entry.extra['view'], 'shared_device')
        self.assertEqual(entry.extra['device_id'], 'dev-abc')
        self.assertEqual(entry.extra['accounts'], 1)

    def test_missing_user_does_not_create_an_entry(self):
        """404 — hech qanday sezgir ma'lumot ko'rsatilmadi, demak yozuv ham yo'q."""
        self.client.get(reverse('admin-user-detail', args=[999999]))
        self.client.get(reverse('admin-user-login-history', args=[999999]))
        self.assertEqual(self._entries().count(), 0)

    def test_forbidden_request_does_not_create_an_entry(self):
        outsider = self.make_user('6002')
        self.client.force_authenticate(user=outsider)
        res = self.client.get(reverse('admin-user-detail', args=[self.user.id]))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._entries().count(), 0)

    def test_each_view_creates_its_own_entry(self):
        """Jurnal "necha marta ko'rildi" savoliga ham javob berishi kerak —
        takroriy ochish alohida yozuv."""
        url = reverse('admin-user-detail', args=[self.user.id])
        self.client.get(url)
        self.client.get(url)
        self.assertEqual(self._entries().count(), 2)


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminSharedDeviceAccountsTestCase(AdminDataTestMixin, APITestCase):
    """GET /api/admin/security/shared-device/ + .../<device_id>/ (Feature-2)."""

    def setUp(self):
        self.admin = self.make_admin()
        self.list_url = reverse('admin-shared-device-accounts')
        self.client.force_authenticate(user=self.admin)

    def _session(self, user, device_id, *, days_ago=0):
        session = TestSession.objects.create(
            user=user,
            olympiad=self.make_olympiad(f'Sessiya {user.id}'),
            last_device_id=device_id,
        )
        if days_ago:
            TestSession.objects.filter(pk=session.pk).update(
                started_at=timezone.now() - timedelta(days=days_ago),
            )
        return session

    def _fill_device(self, device_id, count, *, prefix='1', days_ago=0):
        for i in range(count):
            self._session(self.make_user(f'{prefix}{i:03d}'), device_id, days_ago=days_ago)

    def test_device_over_threshold_is_listed(self):
        # Standart chegara 3 (IP'dagi 5 emas): bitta qurilmani sinfxona
        # baham ko'rmaydi, shuning uchun signal kuchliroq.
        self._fill_device('dev-1', 3)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['min_accounts'], 3)
        self.assertEqual(res.data['window_days'], 30)
        self.assertEqual(len(res.data['results']), 1)
        row = res.data['results'][0]
        self.assertEqual(row['device_id'], 'dev-1')
        self.assertEqual(row['distinct_users'], 3)
        self.assertIsNotNone(row['first_seen'])
        self.assertIsNotNone(row['last_seen'])

    def test_device_below_threshold_is_not_listed(self):
        self._fill_device('dev-2', 2, prefix='2')
        self.assertEqual(self.client.get(self.list_url).data['results'], [])

    def test_empty_device_ids_are_never_grouped(self):
        """Eng muhim salbiy holat: `last_device_id` — oddiy CharField
        (default=''), ping kelmagan har bir sessiyada bo'sh. Chetlatilmasa
        hammasi bitta soxta "qurilma" bo'lib ro'yxat boshini egallardi."""
        self._fill_device('', 5, prefix='3')
        self.assertEqual(self.client.get(self.list_url).data['results'], [])

    def test_same_user_many_sessions_is_not_shared(self):
        user = self.make_user('4000')
        for _ in range(4):
            self._session(user, 'dev-3')
        self.assertEqual(self.client.get(self.list_url).data['results'], [])

    def test_sessions_outside_window_are_excluded(self):
        self._fill_device('dev-4', 3, prefix='5', days_ago=40)
        self.assertEqual(self.client.get(self.list_url).data['results'], [])
        res = self.client.get(self.list_url, {'days': 60})
        self.assertEqual(res.data['window_days'], 60)
        self.assertEqual([r['device_id'] for r in res.data['results']], ['dev-4'])

    def test_results_sorted_by_distinct_users_desc(self):
        self._fill_device('dev-5', 3, prefix='6')
        self._fill_device('dev-6', 4, prefix='7')
        res = self.client.get(self.list_url)
        self.assertEqual(
            [r['device_id'] for r in res.data['results']], ['dev-6', 'dev-5'],
        )

    def test_invalid_and_out_of_range_params_are_clamped(self):
        self._fill_device('dev-7', 3, prefix='8')
        res = self.client.get(self.list_url, {'min_accounts': 'abc', 'days': 'xyz'})
        self.assertEqual(res.data['min_accounts'], 3)
        self.assertEqual(res.data['window_days'], 30)
        res = self.client.get(self.list_url, {'min_accounts': 1, 'days': -5})
        self.assertEqual(res.data['min_accounts'], 2)
        self.assertEqual(res.data['window_days'], 1)
        res = self.client.get(self.list_url, {'min_accounts': 9999, 'days': 9999})
        self.assertEqual(res.data['min_accounts'], 100)
        self.assertEqual(res.data['window_days'], 365)

    def test_non_admin_is_forbidden(self):
        self.client.force_authenticate(user=self.make_user('9001'))
        self.assertEqual(
            self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN,
        )

    def test_anonymous_is_denied(self):
        self.client.force_authenticate(user=None)
        self.assertIn(
            self.client.get(self.list_url).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    # ─── Detail ──────────────────────────────────────────────────────────────

    def test_detail_returns_distinct_accounts_of_that_device(self):
        first = self.make_user('9101', full_name='Birinchi')
        second = self.make_user('9102', full_name='Ikkinchi')
        outsider = self.make_user('9103', full_name='Boshqa')
        self._session(first, 'dev-x', days_ago=2)
        self._session(second, 'dev-x', days_ago=5)
        self._session(outsider, 'dev-y')
        res = self.client.get(reverse('admin-shared-device-detail', args=['dev-x']))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['device_id'], 'dev-x')
        # Eng oxirgi sessiya birinchi.
        self.assertEqual([a['user_id'] for a in res.data['accounts']], [first.id, second.id])
        row = res.data['accounts'][0]
        self.assertEqual(row['full_name'], 'Birinchi')
        self.assertEqual(row['phone'], first.normalized_phone)
        self.assertTrue(row['is_active'])
        self.assertIsNotNone(row['last_session_at'])

    def test_detail_ignores_window(self):
        user = self.make_user('9200')
        self._session(user, 'dev-old', days_ago=400)
        res = self.client.get(reverse('admin-shared-device-detail', args=['dev-old']))
        self.assertEqual([a['user_id'] for a in res.data['accounts']], [user.id])

    def test_detail_unknown_device_is_empty_not_404(self):
        res = self.client.get(reverse('admin-shared-device-detail', args=['dev-yoq']))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['accounts'], [])

    def test_detail_non_admin_is_forbidden(self):
        self.client.force_authenticate(user=self.make_user('9300'))
        res = self.client.get(reverse('admin-shared-device-detail', args=['dev-x']))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
