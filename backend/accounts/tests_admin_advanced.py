"""Kengaytirilgan Admin Foydalanuvchi Nazorati testlari (tests_admin_advanced.py)."""
from datetime import timedelta

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import (
    AuditLog,
    CoinTransaction,
    DeviceFingerprint,
    LoginEvent,
    User,
    UserFlashAlert,
)
from attempts.models import TestAttempt, TestSession
from billing.models import PaymentTransaction, UserSubscription
from centers.models import CenterMembership, EducationCenter
from olympiads.models import Olympiad


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminAdvancedUserControlTestCase(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901111111',
            password='AdminPassword123!',
            full_name='Platform Admin',
        )
        self.student = User.objects.create_user(
            phone='+998902222222',
            password='StudentPass123!',
            full_name='Ali Valiyev',
            roles=['student'],
        )
        self.center = EducationCenter.objects.create(
            name='Registon O‘quv Markazi',
            owner=self.admin_user,
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Matematika Bahor 2025',
            subject='Matematika',
            duration_minutes=30,
            status=Olympiad.STATUS_ACTIVE,
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_risk_score_calculation(self):
        """Risk score endpoint hisoblashni to'g'ri qaytarishi kerak."""
        # 1 ta disqualified attempt yaratamiz
        TestAttempt.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            score=0,
            disqualified=True,
        )
        url = f'/api/admin/users/{self.student.id}/risk-score/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('risk_score', response.data)
        self.assertGreaterEqual(response.data['risk_score'], 20)
        self.assertIn('factors', response.data)

    def test_risk_score_get_does_not_write_to_db(self):
        """GET yon ta'sirsiz bo'lishi kerak.

        Avval bu endpoint `User.risk_score` ustuniga yozardi — admin
        "Batafsil" oynasini ochishining O'ZI hisobni o'zgartirardi, va o'sha
        qiymat `UserSerializer` orqali foydalanuvchining o'ziga ochilardi.
        Ustunning o'zi olib tashlandi (migratsiya 0057), shuning uchun test
        endi umumiy qoidani qo'riqlaydi: bu GET hech qanday YOZUV so'rovi
        yubormasin (kelajakda boshqa ustunga yozib qo'yilmasin ham).
        """
        TestAttempt.objects.create(
            user=self.student, olympiad=self.olympiad, score=0, disqualified=True,
        )
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(f'/api/admin/users/{self.student.id}/risk-score/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(response.data['risk_score'], 0)
        writes = [
            q['sql'] for q in ctx.captured_queries
            if q['sql'].lstrip().upper().startswith(('UPDATE', 'INSERT', 'DELETE'))
        ]
        self.assertEqual(writes, [], f'GET yozuv so‘rovi yubordi: {writes}')

    def test_risk_score_matches_user_detail(self):
        """To'rtta formula bitta bo'ldi: `admin_user_risk_score` va
        `admin_user_detail` bir xil ball va bir xil DARAJA nomini beradi
        (avval bu endpoint 20/40/70 chegaralari bilan inglizcha yorliq
        qaytarardi, panel esa ikkalasini bitta ekranda ko'rsatardi)."""
        TestAttempt.objects.create(
            user=self.student, olympiad=self.olympiad, score=0, disqualified=True,
        )
        DeviceFingerprint.objects.create(
            user=self.student, fingerprint_hash='e' * 32, is_banned=True,
        )
        risk = self.client.get(f'/api/admin/users/{self.student.id}/risk-score/')
        detail = self.client.get(f'/api/admin/users/{self.student.id}/')
        self.assertEqual(risk.data['risk_score'], detail.data['risk_score'])
        self.assertEqual(risk.data['risk_level'], detail.data['risk_level'])
        # 25 (bitta diskvalifikatsiya) + 35 (bloklangan qurilma) = 60.
        self.assertEqual(risk.data['risk_score'], 60)
        self.assertEqual(risk.data['risk_level'], 'yuqori')
        names = [f['name'] for f in risk.data['factors']]
        self.assertIn('Bloklangan apparat izi (Banned Device)', names)

    def test_live_proctoring_risk_score_is_computed_not_stale_column(self):
        """Jonli ro'yxatdagi "xavf" ustuni eskirgan ustundan emas, yagona
        formuladan keladi — aks holda admin hali ochmagan hisoblarda u har
        doim 0 bo'lardi (aynan imtihon paytida, xavf eng kerak bo'lganda)."""
        TestSession.objects.create(
            user=self.student, olympiad=self.olympiad, status=TestSession.STATUS_ACTIVE,
        )
        DeviceFingerprint.objects.create(
            user=self.student, fingerprint_hash='f' * 32, is_banned=True,
        )
        res = self.client.get('/api/admin/security/live-proctoring/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        row = next(r for r in res.data['results'] if r['user']['id'] == self.student.id)
        self.assertEqual(row['user']['risk_score'], 35)
        self.assertEqual(row['user']['risk_tier'], "o'rta")

    def test_live_proctoring_and_termination(self):
        """Jonli test sessiyasi monitoringi va uni to'xtatish."""
        session = TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_ACTIVE,
        )
        # List
        resp_list = self.client.get('/api/admin/security/live-proctoring/')
        self.assertEqual(resp_list.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp_list.data['count'], 1)

        # Terminate
        resp_term = self.client.post(
            f'/api/admin/security/live-proctoring/{session.id}/terminate/',
            {'reason': 'Anticheat buzilishi'},
            format='json',
        )
        self.assertEqual(resp_term.status_code, status.HTTP_200_OK)
        session.refresh_from_db()
        self.assertEqual(session.status, TestSession.STATUS_DISQUALIFIED)
        self.assertIn('Anticheat buzilishi', session.cheating_reason)

    def test_device_fingerprint_and_ban(self):
        """Qurilma izini ro'yxatdan o'tkazish va bloklash."""
        dev = DeviceFingerprint.objects.create(
            user=self.student,
            fingerprint_hash='hash123456789',
            browser_name='Chrome 120',
            os_name='Windows 11',
            ip_address='192.168.1.1',
        )
        # Get devices
        resp = self.client.get(f'/api/admin/users/{self.student.id}/devices/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['results']), 1)

        # Ban device
        resp_ban = self.client.post(
            '/api/admin/security/devices/ban/',
            {'fingerprint_hash': 'hash123456789', 'reason': 'Spam qurilma'},
            format='json',
        )
        self.assertEqual(resp_ban.status_code, status.HTTP_200_OK)
        dev.refresh_from_db()
        self.assertTrue(dev.is_banned)

        # Unban
        resp_unban = self.client.post(
            '/api/admin/security/devices/unban/',
            {'fingerprint_hash': 'hash123456789'},
            format='json',
        )
        self.assertEqual(resp_unban.status_code, status.HTTP_200_OK)
        dev.refresh_from_db()
        self.assertFalse(dev.is_banned)

    def test_user_timeline_and_heatmap(self):
        """Timeline va Heatmap ma'lumotlari to'g'ri qaytishi kerak."""
        resp_tl = self.client.get(f'/api/admin/users/{self.student.id}/timeline/')
        self.assertEqual(resp_tl.status_code, status.HTTP_200_OK)
        self.assertIn('results', resp_tl.data)

        resp_hm = self.client.get(f'/api/admin/users/{self.student.id}/heatmap/')
        self.assertEqual(resp_hm.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp_hm.data['matrix']), 7)
        self.assertEqual(len(resp_hm.data['matrix'][0]), 24)

    def test_ai_summary(self):
        """AI Diagnostic Summary qaytishi kerak."""
        resp = self.client.get(f'/api/admin/users/{self.student.id}/ai-summary/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('overview', resp.data)
        self.assertIn('recommendations', resp.data)

    def test_center_transfer(self):
        """O'quvchini markazga biriktirish / ko'chirish."""
        resp = self.client.post(
            f'/api/admin/users/{self.student.id}/transfer-center/',
            {'center_id': self.center.id, 'role': 'student', 'action': 'transfer'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(
            CenterMembership.objects.filter(user=self.student, center=self.center).exists()
        )

        # Remove from centers
        resp_rem = self.client.post(
            f'/api/admin/users/{self.student.id}/transfer-center/',
            {'action': 'remove'},
            format='json',
        )
        self.assertEqual(resp_rem.status_code, status.HTTP_200_OK)
        self.assertFalse(
            CenterMembership.objects.filter(user=self.student).exists()
        )

    def test_custom_quota_and_discount(self):
        """Maxsus AI kvota va chegirma belgilash."""
        resp = self.client.post(
            f'/api/admin/users/{self.student.id}/set-quota/',
            {
                'custom_practice_quota': 50,
                'custom_discount_percent': 20,
                'discount_days': 14,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertEqual(self.student.custom_practice_quota, 50)
        self.assertEqual(self.student.custom_discount_percent, 20)
        self.assertIsNotNone(self.student.custom_discount_until)

    def test_coin_transactions_log(self):
        """Tangalar jurnali to'g'ri ro'yxatga olinishi."""
        CoinTransaction.objects.create(
            user=self.student,
            amount=100,
            balance_after=100,
            transaction_type=CoinTransaction.TYPE_STREAK,
            description='7 kunlik streak mukofoti',
        )
        resp = self.client.get(f'/api/admin/users/{self.student.id}/coin-transactions/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 1)

    def test_payment_refund(self):
        """To'lovni bekor qilish / refund."""
        tx = PaymentTransaction.objects.create(
            user=self.student,
            amount=99000,
            provider='click',
            status='success',
        )
        self.student.is_premium = True
        self.student.save()

        resp = self.client.post(
            f'/api/admin/billing/transactions/{tx.id}/refund/',
            {'reason': 'Foydalanuvchi iltimosiga ko‘ra'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        tx.refresh_from_db()
        self.assertEqual(tx.status, 'cancelled')
        self.student.refresh_from_db()
        self.assertFalse(self.student.is_premium)

    def test_flash_alerts(self):
        """Admin foydalanuvchiga modal xabar yuborishi va foydalanuvchi uni o'qishi."""
        # Create alert
        resp = self.client.post(
            f'/api/admin/users/{self.student.id}/flash-alerts/',
            {'title': 'Muhim xabar', 'message': 'Ertaga imtihon bor', 'alert_type': 'urgent'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        alert_id = resp.data['id']

        # Student o'ziga kelgan alertni ko'radi
        self.client.force_authenticate(user=self.student)
        resp_my = self.client.get('/api/me/flash-alert/')
        self.assertEqual(resp_my.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(resp_my.data['alert'])
        self.assertEqual(resp_my.data['alert']['title'], 'Muhim xabar')

        # Read alert
        resp_read = self.client.post(f'/api/me/flash-alert/{alert_id}/read/', format='json')
        self.assertEqual(resp_read.status_code, status.HTTP_200_OK)

        # Qayta so'raganda None bo'lishi kerak
        resp_my2 = self.client.get('/api/me/flash-alert/')
        self.assertIsNone(resp_my2.data['alert'])

    def test_bulk_user_import(self):
        """Ommaviy foydalanuvchilar import qilish."""
        payload = {
            'users': [
                {
                    'full_name': 'Jasur Karimov',
                    'phone': '+998903333333',
                    'role': 'student',
                    'center_id': self.center.id,
                },
                {
                    'full_name': 'Dilnoza Salimova',
                    'phone': '+998904444444',
                    'role': 'teacher',
                },
            ]
        }
        resp = self.client.post('/api/admin/users/bulk-import/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['created_count'], 2)
        self.assertTrue(User.objects.filter(normalized_phone='+998903333333').exists())
        self.assertTrue(User.objects.filter(normalized_phone='+998904444444').exists())


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminSuspiciousUsersQueueTestCase(APITestCase):
    """GET /api/admin/users/suspicious-queue/ — birlashtirilgan navbat."""

    url = '/api/admin/users/suspicious-queue/'

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901111111',
            password='AdminPassword123!',
            full_name='Platform Admin',
        )
        self.center = EducationCenter.objects.create(
            name='Registon O‘quv Markazi',
            owner=self.admin_user,
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Matematika Bahor 2025',
            subject='Matematika',
            duration_minutes=30,
            status=Olympiad.STATUS_ACTIVE,
        )
        # Hech qanday signal bermaydigan hisob — navbatda ko'rinmasligi kerak.
        self.clean_user = User.objects.create_user(
            phone='+998902222222', password='Pass123!', full_name='Toza Hisob',
            roles=['student'], last_seen_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.admin_user)

    def _make_churn_user(self, phone, days_inactive):
        return User.objects.create_user(
            phone=phone, password='Pass123!', full_name=f'Churn {phone}',
            roles=['student'],
            last_seen_at=timezone.now() - timedelta(days=days_inactive),
        )

    def _make_high_risk_user(self, phone):
        """Diskvalifikatsiya (+25) va bloklangan qurilma izi (+35) = 60 ball."""
        user = User.objects.create_user(
            phone=phone, password='Pass123!', full_name=f'Xavfli {phone}',
            roles=['student'], last_seen_at=timezone.now(),
        )
        TestAttempt.objects.create(
            user=user, olympiad=self.olympiad, score=0, disqualified=True,
        )
        DeviceFingerprint.objects.create(
            user=user, fingerprint_hash=f'hash-{phone}', is_banned=True,
        )
        return user

    def _make_shared_device_users(self, phones, device_id):
        """Bitta qurilmadan imtihon topshirgan hisoblar (ko'p-hisob signali)."""
        users = []
        for phone in phones:
            user = User.objects.create_user(
                phone=phone, password='Pass123!', full_name=f'Qurilma {phone}',
                roles=['student'], last_seen_at=timezone.now(),
            )
            TestSession.objects.create(
                user=user, olympiad=self.olympiad, last_device_id=device_id,
            )
            users.append(user)
        return users

    def test_only_users_with_signals_are_returned(self):
        churn_user = self._make_churn_user('+998903333333', 10)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        returned_ids = [row['id'] for row in resp.data['results']]
        self.assertIn(churn_user.id, returned_ids)
        self.assertNotIn(self.clean_user.id, returned_ids)
        self.assertNotIn(self.admin_user.id, returned_ids)
        self.assertEqual(resp.data['count'], len(resp.data['results']))

    def test_results_are_ordered_by_priority_score(self):
        risk_user = self._make_high_risk_user('+998904444444')
        device_users = self._make_shared_device_users(
            ['+998905555555', '+998906666666', '+998907777777'], 'device-abc',
        )
        churn_user = self._make_churn_user('+998908888888', 10)

        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = {row['id']: row for row in resp.data['results']}

        self.assertEqual(rows[risk_user.id]['priority_score'], 60)
        self.assertEqual(rows[risk_user.id]['risk_tier'], 'yuqori')
        for user in device_users:
            self.assertEqual(rows[user.id]['priority_score'], 30)
            self.assertTrue(rows[user.id]['multi_account_device'])
        self.assertEqual(rows[churn_user.id]['priority_score'], 20)
        self.assertEqual(rows[churn_user.id]['churn_risk'], 'medium')
        self.assertTrue(rows[churn_user.id]['signals'])

        scores = [row['priority_score'] for row in resp.data['results']]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_non_admin_is_403(self):
        self.client.force_authenticate(user=self.clean_user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminBulkStudentPremiumTestCase(APITestCase):
    """Ommaviy premium: barcha `student` rolli hisoblarga berish/olib tashlash.

    Test muhitida Celery EAGER rejimida ishlaydi (broker yo'q), ya'ni
    `.delay()` task'ni sinxron bajaradi va endpointdan keyin DB holatini
    to'g'ridan-to'g'ri tekshirish mumkin.
    """

    preview_url = '/api/admin/users/premium-bulk-preview/'
    grant_url = '/api/admin/users/bulk-grant-premium-students/'
    revoke_url = '/api/admin/users/bulk-revoke-premium-students/'

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901111111', password='AdminPass123!', full_name='Platform Admin',
        )
        self.student_a = User.objects.create_user(
            phone='+998902222222', password='Pass123!', full_name="O'quvchi A",
            roles=['student'],
        )
        self.student_b = User.objects.create_user(
            phone='+998903333333', password='Pass123!', full_name="O'quvchi B",
            roles=['student'],
        )
        # O'qituvchi va markaz egasi — ommaviy amal ularga TEGMASLIGI kerak.
        self.teacher = User.objects.create_user(
            phone='+998904444444', password='Pass123!', full_name="O'qituvchi",
            roles=['teacher'], is_premium=True,
        )
        self.owner = User.objects.create_user(
            phone='+998905555555', password='Pass123!', full_name='Markaz egasi',
            roles=['owner'], is_premium=True,
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_non_admin_is_403(self):
        self.client.force_authenticate(user=self.student_a)
        self.assertEqual(
            self.client.get(self.preview_url, {'scope': 'grant'}).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(self.grant_url, {'duration': 30}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(self.revoke_url, {}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_preview_counts_only_students(self):
        resp = self.client.get(self.preview_url, {'scope': 'grant'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 2)

        # Revoke qamrovi — hozir premiumi bor o'quvchilar (hozircha yo'q).
        resp = self.client.get(self.preview_url, {'scope': 'revoke'})
        self.assertEqual(resp.data['count'], 0)

        self.student_a.is_premium = True
        self.student_a.save(update_fields=['is_premium'])
        resp = self.client.get(self.preview_url, {'scope': 'revoke'})
        self.assertEqual(resp.data['count'], 1)

    def test_preview_rejects_unknown_scope(self):
        resp = self.client.get(self.preview_url, {'scope': 'delete'})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_grant_applies_to_every_student_only(self):
        resp = self.client.post(
            self.grant_url,
            {'duration': 30, 'plan_type': 'student', 'plan_name': 'Pro'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 2)

        for student in (self.student_a, self.student_b):
            student.refresh_from_db()
            self.assertTrue(student.is_premium)
            sub = UserSubscription.objects.get(user=student, is_active=True)
            self.assertEqual(sub.plan.plan_type, 'student')
            self.assertEqual(sub.plan.duration_days, 30)
            self.assertTrue(sub.plan.name.startswith('Pro'))
            self.assertGreater(sub.end_date, timezone.now())

        # Admin hisobiga ham, o'quvchi bo'lmagan rollarga ham obuna berilmaydi.
        self.assertFalse(
            UserSubscription.objects.filter(
                user__in=[self.admin_user, self.teacher, self.owner],
            ).exists()
        )

        log = AuditLog.objects.get(action='admin_bulk_premium_students')
        self.assertEqual(log.extra['mode'], 'grant')
        self.assertEqual(log.extra['count'], 2)
        self.assertCountEqual(
            log.extra['user_ids'], [self.student_a.id, self.student_b.id],
        )

    def test_grant_rejects_unknown_duration(self):
        resp = self.client.post(self.grant_url, {'duration': 45}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(UserSubscription.objects.exists())

    def test_revoke_clears_students_but_not_other_roles(self):
        self.client.post(
            self.grant_url, {'duration': 30, 'plan_type': 'student'}, format='json',
        )
        # Sinov muddati ham so'ndirilishi kerak — aks holda `is_premium_active`
        # (is_premium OR trial_active) hamon Premium ko'rsatardi.
        self.student_b.premium_trial_end = timezone.now() + timedelta(days=5)
        self.student_b.save(update_fields=['premium_trial_end'])

        resp = self.client.post(self.revoke_url, {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 2)

        for student in (self.student_a, self.student_b):
            student.refresh_from_db()
            self.assertFalse(student.is_premium_active)
        self.assertFalse(UserSubscription.objects.filter(is_active=True).exists())

        self.teacher.refresh_from_db()
        self.owner.refresh_from_db()
        self.assertTrue(self.teacher.is_premium)
        self.assertTrue(self.owner.is_premium)

    def test_revoke_without_premium_students_is_noop(self):
        resp = self.client.post(self.revoke_url, {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 0)
        self.assertFalse(resp.data['queued'])
        self.assertFalse(
            AuditLog.objects.filter(action='admin_bulk_premium_students').exists()
        )

    def test_collusion_detection(self):
        """Collusion detection finds pairs with matching answers."""
        center = EducationCenter.objects.create(name='Test Center', owner=self.admin_user)
        olympiad = Olympiad.objects.create(
            center=center, title='Matematika Test', subject='Matematika', duration_minutes=30, status=Olympiad.STATUS_ACTIVE,
        )
        answers = {
            'q1': {'answer': 'A', 'is_correct': True},
            'q2': {'answer': 'B', 'is_correct': False},
            'q3': {'answer': 'C', 'is_correct': False},
            'q4': {'answer': 'D', 'is_correct': False},
        }
        TestAttempt.objects.create(user=self.student_a, olympiad=olympiad, answers=answers, score=25)
        TestAttempt.objects.create(user=self.student_b, olympiad=olympiad, answers=answers, score=25)

        resp = self.client.get('/api/admin/security/collusion/?days=30&min_similarity=70')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['detected_pairs_count'], 1)
        pair = resp.data['results'][0]
        self.assertEqual(pair['similarity_pct'], 100.0)
        self.assertEqual(pair['identical_wrong_answers'], 3)

    def test_anomalies_speedrun_and_score_jump(self):
        """Speedrun and score jump detection."""
        center = EducationCenter.objects.create(name='Test Center Speedrun', owner=self.admin_user)
        olympiad = Olympiad.objects.create(
            center=center, title='Fizika Test', subject='Fizika', duration_minutes=30, status=Olympiad.STATUS_ACTIVE,
        )
        TestAttempt.objects.create(
            user=self.student_a,
            olympiad=olympiad,
            score=90,
            time_spent=10,
            total_questions=10,
        )
        resp = self.client.get('/api/admin/security/anomalies/?days=30')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['count'], 1)
        speedrun = [r for r in resp.data['results'] if r['type'] == 'speedrun']
        self.assertTrue(len(speedrun) >= 1)

    def test_user_passport(self):
        """Student 360 passport endpoint returns complete profile."""
        resp = self.client.get(f'/api/admin/users/{self.student_a.id}/passport/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('passport_id', resp.data)
        self.assertIn('academic_summary', resp.data)
        self.assertIn('security_integrity', resp.data)
        self.assertIn('financials', resp.data)

    def test_realtime_presence_and_kill_sessions(self):
        """Realtime presence and kill sessions."""
        self.student_a.last_seen_at = timezone.now()
        self.student_a.save(update_fields=['last_seen_at'])

        resp = self.client.get('/api/admin/presence/live/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['total_active'], 1)

        prev_token_version = self.student_a.token_version
        kill_resp = self.client.post(f'/api/admin/users/{self.student_a.id}/kill-all-sessions/')
        self.assertEqual(kill_resp.status_code, status.HTTP_200_OK)
        self.student_a.refresh_from_db()
        self.assertEqual(self.student_a.token_version, prev_token_version + 1)

    def test_auto_moderation_rules_and_broadcast_flash_alert(self):
        """Auto moderation rules and broadcast flash alert."""
        rules_resp = self.client.get('/api/admin/security/rules/')
        self.assertEqual(rules_resp.status_code, status.HTTP_200_OK)
        self.assertIn('rules', rules_resp.data)

        up_resp = self.client.post('/api/admin/security/rules/', {'tab_switch_limit': 10}, format='json')
        self.assertEqual(up_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(up_resp.data['rules']['tab_switch_limit'], 10)

        alert_resp = self.client.post('/api/admin/broadcast/flash-alert/', {
            'title': 'Diqqat qoida!',
            'message': 'Olimpiadada halol bo\'ling',
            'level': 'warning',
            'target': 'all',
        }, format='json')
        self.assertEqual(alert_resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(alert_resp.data['sent_count'], 1)
        self.assertTrue(UserFlashAlert.objects.filter(user=self.student_a).exists())


