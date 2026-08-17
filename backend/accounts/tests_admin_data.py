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

from accounts.models import AuditLog, DeviceFingerprint, LoginEvent, User
from accounts.serializers import AdminUserListSerializer, UserSerializer
from attempts.models import TestAttempt, TestSession
from centers.models import CenterMembership, EducationCenter
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

    def attempt(self, user, *, disqualified=False, score=50):
        """Bitta test urinishi. Har chaqiruv YANGI olimpiada yasaydi —
        `TestAttempt` da (user, olympiad) unique."""
        return TestAttempt.objects.create(
            user=user,
            olympiad=self.make_olympiad(f'Olimpiada {user.id}'),
            score=score,
            disqualified=disqualified,
        )

    def disqualify(self, user, count=1):
        """`count` ta diskvalifikatsiya qilingan urinish."""
        for _ in range(count):
            self.attempt(user, disqualified=True, score=0)


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
class AdminUserFilterAnnotationTestCase(AdminDataTestMixin, APITestCase):
    """Annotatsiyaga tayanadigan filtrlar IKKALA endpointda ham ishlaydi.

    `_filter_admin_users_advanced` ikkita TURLI queryset ustida chaqiriladi:
    annotatsiyalangan ro'yxat (`admin_users_list`) va yalang'och CSV eksporti
    (`admin_users_export`). `?activity=never_tested` `total_attempts_count`
    annotatsiyasiga tayanadi va eksportda u yo'q edi — endpoint
    `FieldError` bilan 500 qaytarardi.
    """

    def setUp(self):
        self.admin = self.make_admin()
        self.list_url = reverse('admin-users-list')
        self.export_url = reverse('admin-users-export')
        self.client.force_authenticate(user=self.admin)

    def test_never_tested_filter_on_list(self):
        untested = self.make_user('7001', full_name='Topshirmagan')
        tested = self.make_user('7002', full_name='Topshirgan')
        self.attempt(tested)
        res = self.client.get(self.list_url, {'activity': 'never_tested'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([r['id'] for r in res.data['results']], [untested.id])

    def test_never_tested_does_not_crash_csv_export(self):
        """Regressiya: avval bu so'rov `FieldError` (500) qaytarardi."""
        self.make_user('7101', full_name='Topshirmagan Hisob')
        tested = self.make_user('7102', full_name='Topshirgan Hisob')
        self.attempt(tested)
        res = self.client.get(self.export_url, {'activity': 'never_tested'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = [line for line in res.content.decode('utf-8-sig').splitlines() if line.strip()]
        # Sarlavha + faqat bitta qator.
        self.assertEqual(len(rows), 2)
        self.assertIn('Topshirmagan Hisob', rows[1])

    def test_disqualified_attempt_still_counts_as_never_tested(self):
        """`total_attempts_count` faqat diskvalifikatsiya QILINMAGAN
        urinishlarni sanaydi — semantika ro'yxatda ham, eksportda ham bir xil."""
        only_dq = self.make_user('7201', full_name='Faqat DQ')
        self.disqualify(only_dq, 1)
        listed = self.client.get(self.list_url, {'activity': 'never_tested'})
        self.assertEqual([r['id'] for r in listed.data['results']], [only_dq.id])
        exported = self.client.get(self.export_url, {'activity': 'never_tested'})
        self.assertEqual(exported.status_code, status.HTTP_200_OK)
        self.assertIn('Faqat DQ', exported.content.decode('utf-8-sig'))

    def test_never_tested_combined_with_risk_filter_on_export(self):
        """Ikkala annotatsiya bir vaqtda: har biri o'zini qo'shadi va
        `attempts` join'i takrorlanmaydi."""
        risky = self.make_user('7301', full_name='DQ Hisob')
        self.disqualify(risky, 2)          # 50 ball → "o'rta", non-DQ urinish 0
        clean = self.make_user('7302', full_name='Toza Hisob')
        self.attempt(clean)                # topshirgan, xavfsiz
        res = self.client.get(self.export_url, {'activity': 'never_tested', 'risk': "o'rta"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        text = res.content.decode('utf-8-sig')
        self.assertIn('DQ Hisob', text)
        self.assertNotIn('Toza Hisob', text)

    def test_every_supported_filter_value_is_accepted_by_both_endpoints(self):
        """Qo'riqchi test: kelajakda annotatsiyaga tayanadigan yangi filtr
        qo'shilsa va u faqat ro'yxatda annotatsiya qilinsa, eksport 500
        qaytaradi — shu test uni darhol ushlaydi."""
        user = self.make_user('7401', full_name='Aralash Hisob')
        self.attempt(user)
        self.disqualify(user, 1)
        cases = [
            ('search', ['Aralash', '+998908887401']),
            ('role', ['all', 'admin', 'student', 'teacher', 'manager', 'owner']),
            ('status', ['active', 'blocked', 'exam_blocked', 'soft_deleted',
                        'telegram_linked', 'telegram_unlinked']),
            ('plan', ['free', 'trial', 'premium']),
            ('activity', ['online', 'today', 'inactive_7d', 'never_tested']),
            ('tag', ['all', 'vip']),
            ('risk', ['past', "o'rta", 'yuqori', 'kritik', 'high', 'all', 'nonsense',
                      'yuqori+', 'high+', 'nonsense+']),
        ]
        for param, values in cases:
            for value in values:
                for url in (self.list_url, self.export_url):
                    with self.subTest(param=param, value=value, url=url):
                        res = self.client.get(url, {param: value})
                        self.assertEqual(res.status_code, status.HTTP_200_OK)


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
            # `target_type` AYNAN yozuvchi qo'yadigan qiymat
            # (`moderation.services.maybe_flag_warning_threshold` → 'User').
            # Avval bu yerda kichik harfli 'user' turardi va test faqat
            # so'rovning O'ZI bilan mos kelgani uchun o'tardi — haqiqiy
            # bayroqlar esa hisobga tushmasdi.
            target_type='User',
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

    def test_banned_device_alone_is_not_low_risk(self):
        """Qurilma bloki — ro'yxat formulasining bir qismi.

        Avval bu signal FAQAT `admin_user_risk_score` da bor edi: bloklangan
        apparat izi bilan, boshqa signalsiz hisob ro'yxatda 'past' (yashil)
        turardi va admin xavf bo'yicha saralaganda aynan shu qoidabuzarni
        o'tkazib yuborardi.
        """
        user = self.make_user('5008')
        self.assertEqual(self._tier(user), 'past')
        DeviceFingerprint.objects.create(
            user=user, fingerprint_hash='a' * 32, is_banned=True,
        )
        # +35 → "o'rta" (26..55).
        self.assertEqual(self._tier(user), "o'rta")

    def test_second_banned_device_does_not_double_count(self):
        """Ball qurilmalar SONIGA bog'liq emas (`Exists`, `min` emas) —
        detaldagi `+35` bilan bir xil qoida."""
        user = self.make_user('5009')
        for i in range(3):
            DeviceFingerprint.objects.create(
                user=user, fingerprint_hash=f'b{i}' * 16, is_banned=True,
            )
        self.assertEqual(self._tier(user), "o'rta")

    def test_list_reaches_critical_with_every_cheap_signal(self):
        """Qurilma bloki qo'shilgach ro'yxatning eng katta balli 80 emas, 100
        (50+35+20+10 = 115, yuqori chegara bilan kesilgan) — ya'ni 'kritik'
        endi ro'yxatda ham, `?risk=kritik` filtrida ham chiqadi."""
        user = self.make_user('5010')
        self.disqualify(user, 2)
        user.exam_block_reason = 'Taqiq'
        user.save(update_fields=['exam_block_reason'])
        DeviceFingerprint.objects.create(
            user=user, fingerprint_hash='c' * 32, is_banned=True,
        )
        ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_WARNING_THRESHOLD,
            target_type='User', target_id=user.id, reason='Ko‘p ogohlantirish',
        )
        self.assertEqual(self._tier(user), 'kritik')
        res = self.client.get(self.url, {'risk': 'kritik'})
        self.assertEqual([r['id'] for r in res.data['results']], [user.id])

    def test_list_tier_matches_detail_risk_level(self):
        """Ro'yxat va "Batafsil" oynasi bir xil so'z bilan gapirishi kerak:
        arzon signallar to'plamida ikkala hisob-kitob aynan bir xil ball
        beradi (ro'yxat qimmat signallarni O'TKAZIB YUBORADI, ya'ni hech
        qachon xavfni oshirib ko'rsatmaydi)."""
        user = self.make_user('5007')
        self.disqualify(user, 2)
        user.exam_block_reason = 'Taqiq'
        user.save(update_fields=['exam_block_reason'])
        DeviceFingerprint.objects.create(
            user=user, fingerprint_hash='d' * 32, is_banned=True,
        )
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

    def _tiered_users(self):
        """Har bir darajadan bittadan hisob: past / o'rta / yuqori / kritik."""
        clean = self.make_user('5501')
        medium = self.make_user('5502')
        self.disqualify(medium, 2)
        high = self.make_user('5503')
        self.disqualify(high, 2)
        high.exam_block_reason = 'Taqiq'
        high.save(update_fields=['exam_block_reason'])
        critical = self.make_user('5504')
        self.disqualify(critical, 2)
        critical.exam_block_reason = 'Taqiq'
        critical.save(update_fields=['exam_block_reason'])
        DeviceFingerprint.objects.create(
            user=critical, fingerprint_hash='g' * 32, is_banned=True,
        )
        ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_WARNING_THRESHOLD,
            target_type='User', target_id=critical.id, reason='Ko‘p ogohlantirish',
        )
        return clean, medium, high, critical

    def _ids(self, **params):
        res = self.client.get(self.url, params)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return {r['id'] for r in res.data['results']}

    def test_at_least_filter_covers_higher_tiers(self):
        """`?risk=yuqori+` — "yuqori VA undan yuqori".

        Panelning "Yuqori xavf" SEGMENTI shu qiymatni yuboradi. Oddiy
        `yuqori` bilan bloklangan apparat izli 'kritik' hisoblar segmentdan
        tushib qolardi — admin eng xavfli qoidabuzarlarni aynan shu tugmani
        bosib ko'rmay qolardi.
        """
        clean, medium, high, critical = self._tiered_users()
        self.assertEqual(self._ids(risk='yuqori+'), {high.id, critical.id})
        self.assertEqual(
            self._ids(risk="o'rta+"), {medium.id, high.id, critical.id},
        )
        # Eng quyi daraja + suffiks — hammasi (filtrsiz bilan bir xil).
        self.assertEqual(
            self._ids(risk='past+'), {clean.id, medium.id, high.id, critical.id},
        )

    def test_plain_tier_filter_stays_exact(self):
        """Suffikssiz qiymat AYNAN bitta darajani beradi — ochiluvchi
        ro'yxatdagi "Kritik xavf" varianti shunga tayanadi."""
        clean, medium, high, critical = self._tiered_users()
        self.assertEqual(self._ids(risk='yuqori'), {high.id})
        self.assertEqual(self._ids(risk='kritik'), {critical.id})

    def test_at_least_filter_accepts_latin_alias(self):
        """`high+` — lotincha taxallus ham `+` bilan ishlaydi."""
        clean, medium, high, critical = self._tiered_users()
        self.assertEqual(self._ids(risk='high+'), {high.id, critical.id})

    def test_at_least_filter_survives_plus_decoded_as_space(self):
        """KODLANMAGAN `?risk=yuqori+` da `+` probelga aylanadi.

        Busiz filtr jimgina "aynan yuqori" ga tushib qolardi va segment
        yana 'kritik' hisoblarni tashlab ketardi — xatoning o'zi ko'rinmasdi
        (400 emas, shunchaki kamroq qator).
        """
        clean, medium, high, critical = self._tiered_users()
        self.assertEqual(self._ids(risk='yuqori '), {high.id, critical.id})

    def test_at_least_filter_works_on_csv_export_too(self):
        """Eksport queryset'ida annotatsiya yo'q — `+` shakli ham uni o'zi
        qo'shishi kerak (aks holda `FieldError` bilan 500)."""
        clean, medium, high, critical = self._tiered_users()
        res = self.client.get(reverse('admin-users-export'), {'risk': 'yuqori+'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        text = res.content.decode('utf-8-sig')
        self.assertIn(str(high.normalized_phone), text)
        self.assertIn(str(critical.normalized_phone), text)
        self.assertNotIn(str(medium.normalized_phone), text)

    def test_unknown_tier_with_suffix_is_ignored(self):
        """Noma'lum qiymat + `+` — filtr e'tiborsiz qoldiriladi (buzuq
        parametr butun ro'yxatni bo'shatib yubormasin)."""
        clean, medium, high, critical = self._tiered_users()
        self.assertEqual(
            self._ids(risk='nonsense+'),
            {clean.id, medium.id, high.id, critical.id},
        )

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


# `UserSerializer` orqali HECH KIMGA (na hisobning o'ziga, na markaz
# xodimiga) chiqmasligi kerak bo'lgan ichki maydonlar.
#
# `risk_score` — antifrod signali: uni hisobning O'ZI ko'rsa, qaysi harakati
# ballni oshirganini sinab, tekshiruvni chetlab o'tishni o'rganadi. Bu endi
# USTUN emas (migratsiya 0057 uni o'chirdi), lekin javob KALITI sifatida
# admin endpointlarida bor — ya'ni "foydalanuvchiga chiqmasin" sharti
# kuchida qoladi.
# `admin_tags` — admin CRM yorliqlari ('shubhali', 'chargeback').
# `custom_*` — admin qo'lda bergan kvota/chegirma (ichki tijorat qarori).
INTERNAL_ONLY_USER_FIELDS = (
    'risk_score',
    'admin_tags',
    'custom_practice_quota',
    'custom_discount_percent',
    'custom_discount_until',
)


@override_settings(SECURE_SSL_REDIRECT=False)
class InternalUserFieldsExposureTestCase(AdminDataTestMixin, APITestCase):
    """Ichki maydonlar IKKI YO'NALISHDA tekshiriladi.

    613 testli yashil suite `risk_score` sizib chiqishini ushlamagan edi,
    chunki mavjud testlar faqat "admin endpointida maydon BOR" tomonini
    tekshirardi. Bu yerda ikkalasi ham bor: admin ko'radigan joyda BOR,
    foydalanuvchi va markaz xodimi ko'radigan joyda YO'Q.
    """

    def setUp(self):
        self.admin = self.make_admin()
        self.owner = self.make_user('6001', full_name='Markaz Egasi')
        self.student = self.make_user('6002', full_name='O‘quvchi')
        # Ichki maydonlarni nolinchi bo'lmagan qiymatlar bilan to'ldiramiz:
        # serializer maydonni tashlab yuborganini "qiymat 0/bo'sh" holatidan
        # farqlab bo'lsin.
        self.student.admin_tags = ['shubhali']
        self.student.custom_practice_quota = 50
        self.student.custom_discount_percent = 40
        self.student.custom_discount_until = timezone.now() + timedelta(days=30)
        self.student.save()

        self.center = EducationCenter.objects.create(
            name='Registon markazi',
            owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        CenterMembership.objects.create(
            center=self.center,
            user=self.student,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        )

    def _assert_clean(self, payload, where):
        for field in INTERNAL_ONLY_USER_FIELDS:
            self.assertNotIn(field, payload, f'{field} {where} javobiga sizib chiqdi')

    # ── Sizib chiqmasligi kerak ────────────────────────────────────────────
    def test_me_endpoint_hides_internal_fields_from_the_user_himself(self):
        """`GET /api/me/` — istalgan o'quvchi `curl` bilan o'z antifrod
        ballini o'qiy olardi."""
        self.client.force_authenticate(user=self.student)
        res = self.client.get(reverse('me'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Hisobning o'ziniki bo'lgan maydonlar joyida qoladi (test maydon
        # ro'yxatini butunlay qirqib tashlagan regressiyani ham ushlasin).
        self.assertEqual(res.data['id'], self.student.id)
        self.assertIn('coins', res.data)
        self._assert_clean(res.data, 'GET /api/me/')

    def test_center_roster_hides_internal_fields_from_center_staff(self):
        """Markaz egasi o'z o'quvchisining xavf balli, admin yorliqlari va
        shaxsiy chegirmasini ko'rmaydi."""
        self.client.force_authenticate(user=self.owner)
        res = self.client.get(
            reverse('students-memberships', args=[self.center.id]),
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        user_payload = rows[0]['user']
        self.assertEqual(user_payload['id'], self.student.id)
        self._assert_clean(user_payload, 'markaz roster')

    def test_serializer_field_lists_do_not_mention_internal_fields(self):
        """Serializer darajasidagi qo'riqchi: `UserSerializer` HAR JOYDA
        ishlatiladi (login, profil, markaz javoblari, admin amallari), ya'ni
        maydonni ro'yxatga qaytarish bitta emas, o'nlab endpointni ochadi."""
        for field in INTERNAL_ONLY_USER_FIELDS:
            self.assertNotIn(field, UserSerializer.Meta.fields)
            self.assertNotIn(field, UserSerializer.Meta.read_only_fields)
            self.assertNotIn(field, UserSerializer().fields)

    def test_risk_score_is_in_no_serializer_at_all(self):
        """`risk_score` `AdminUserListSerializer` ga ham qo'shilmaydi:
        `User.risk_score` USTUNI umuman yo'q (migratsiya 0057), ya'ni model
        maydoni sifatida uni serialize qilib ham bo'lmaydi. Ro'yxatdagi
        jonli qiymat — `risk_tier` annotatsiyasi."""
        self.assertNotIn('risk_score', AdminUserListSerializer.Meta.fields)
        self.assertIn('risk_tier', AdminUserListSerializer.Meta.fields)
        model_fields = {f.name for f in User._meta.get_fields()}
        self.assertNotIn('risk_score', model_fields)

    # ── Admin ko'radigan joyda bo'lishi SHART ──────────────────────────────
    def test_admin_list_still_exposes_internal_fields(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse('admin-users-list'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        row = next(r for r in res.data['results'] if r['id'] == self.student.id)
        self.assertEqual(row['admin_tags'], ['shubhali'])
        self.assertEqual(row['custom_practice_quota'], 50)
        self.assertEqual(row['custom_discount_percent'], 40)
        self.assertIsNotNone(row['custom_discount_until'])

    def test_admin_detail_still_exposes_internal_fields(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse('admin-user-detail', args=[self.student.id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['admin_tags'], ['shubhali'])
        self.assertEqual(res.data['custom_practice_quota'], 50)
        self.assertEqual(res.data['custom_discount_percent'], 40)
        self.assertIsNotNone(res.data['custom_discount_until'])
        # Detaldagi `risk_score` — saqlangan ustun emas, har safar qayta
        # hisoblanadigan jonli qiymat (`compute_user_risk_profile`).
        self.assertEqual(res.data['risk_score'], 0)
        self.assertEqual(res.data['risk_level'], 'past')
