"""Admin paneldagi "Xavfsizlik" tabi endpointlari.

`/api/admin/security/shared-ip/` — bitta IP ortidagi bir nechta hisob.
Bu ro'yxat qoidabuzarlikni ISBOTLAMAYDI (markaz sinfxonasi, oila Wi-Fi,
operator NAT'i ham bir xil IP beradi), shuning uchun testlar aynan
chegara/oyna/huquq qoidalarini qotiradi — natijadan avtomatik chora yo'q.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import LoginEvent

User = get_user_model()


class AdminSharedIpAccountsTestCase(APITestCase):
    """GET /api/admin/security/shared-ip/ + .../<ip>/"""

    def setUp(self):
        self.admin = User.objects.create_user(
            phone='+998908880001', password='AdminPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save()
        self.list_url = reverse('admin-shared-ip-accounts')

    def _user(self, suffix, full_name='Foydalanuvchi'):
        return User.objects.create_user(
            phone=f'+99890888{suffix}', password='UserPass123', full_name=full_name,
        )

    def _login(self, user, ip, *, days_ago=0):
        """LoginEvent yaratadi (`created_at` — auto_now_add, keyin suriladi)."""
        event = LoginEvent.objects.create(user=user, ip_address=ip, user_agent='Test')
        if days_ago:
            LoginEvent.objects.filter(pk=event.pk).update(
                created_at=timezone.now() - timedelta(days=days_ago),
            )
        return event

    def _fill_ip(self, ip, count, *, prefix='1', days_ago=0):
        """`count` ta TURLI hisob shu IP'dan kirgan holatni yasaydi."""
        for i in range(count):
            self._login(self._user(f'{prefix}{i:03d}'), ip, days_ago=days_ago)

    def test_ip_over_threshold_is_listed_with_seen_window(self):
        self._fill_ip('10.0.0.1', 5)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['min_accounts'], 5)
        self.assertEqual(res.data['window_days'], 30)
        self.assertEqual(len(res.data['results']), 1)
        row = res.data['results'][0]
        self.assertEqual(row['ip_address'], '10.0.0.1')
        self.assertEqual(row['distinct_users'], 5)
        self.assertIsNotNone(row['first_seen'])
        self.assertIsNotNone(row['last_seen'])

    def test_ip_below_threshold_is_not_listed(self):
        self._fill_ip('10.0.0.2', 4)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.data['results'], [])

    def test_same_user_many_logins_is_not_shared(self):
        # Bitta hisobning 10 marta kirishi — bu funksiyaning mavzusi emas.
        user = self._user('2000')
        for _ in range(10):
            self._login(user, '10.0.0.3')
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.data['results'], [])

    def test_logins_outside_window_are_excluded(self):
        self._fill_ip('10.0.0.4', 5, days_ago=40)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.data['results'], [])
        # Oyna kengaytirilsa o'sha IP paydo bo'ladi.
        res = self.client.get(self.list_url, {'days': 60})
        self.assertEqual(res.data['window_days'], 60)
        self.assertEqual(len(res.data['results']), 1)
        self.assertEqual(res.data['results'][0]['ip_address'], '10.0.0.4')

    def test_events_without_ip_are_ignored(self):
        # IP'siz kirishlar (proxy sarlavhasi yetib kelmagan) guruhlanmaydi:
        # `GenericIPAddressField` bo'sh satrni ham NULL qilib yozadi.
        for i in range(5):
            LoginEvent.objects.create(user=self._user(f'5{i:03d}'), ip_address=None)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'min_accounts': 2})
        self.assertEqual(res.data['results'], [])

    def test_min_accounts_param_lowers_threshold(self):
        self._fill_ip('10.0.0.5', 3)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'min_accounts': 3})
        self.assertEqual(res.data['min_accounts'], 3)
        self.assertEqual(len(res.data['results']), 1)
        self.assertEqual(res.data['results'][0]['distinct_users'], 3)

    def test_results_sorted_by_distinct_users_desc(self):
        self._fill_ip('10.0.0.6', 5, prefix='6')
        self._fill_ip('10.0.0.7', 7, prefix='7')
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(
            [r['ip_address'] for r in res.data['results']],
            ['10.0.0.7', '10.0.0.6'],
        )

    def test_invalid_query_params_fall_back_to_defaults(self):
        self._fill_ip('10.0.0.8', 5)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'min_accounts': 'abc', 'days': 'xyz'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['min_accounts'], 5)
        self.assertEqual(res.data['window_days'], 30)
        self.assertEqual(len(res.data['results']), 1)

    def test_out_of_range_query_params_are_clamped(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.list_url, {'min_accounts': 1, 'days': -5})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # 1 ta hisob har doim "bir xil IP" bo'lardi — pol 2.
        self.assertEqual(res.data['min_accounts'], 2)
        self.assertEqual(res.data['window_days'], 1)
        res = self.client.get(self.list_url, {'min_accounts': 9999, 'days': 9999})
        self.assertEqual(res.data['min_accounts'], 100)
        self.assertEqual(res.data['window_days'], 365)

    def test_non_admin_is_forbidden(self):
        self.client.force_authenticate(user=self._user('3000'))
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_is_denied(self):
        res = self.client.get(self.list_url)
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    # ─── Detail ──────────────────────────────────────────────────────────────

    def test_detail_returns_distinct_accounts_of_that_ip(self):
        first = self._user('4001', full_name='Birinchi')
        second = self._user('4002', full_name='Ikkinchi')
        outsider = self._user('4003', full_name='Boshqa')
        self._login(first, '10.0.1.1', days_ago=2)
        # Bir xil hisob ikki marta kirsa ham ro'yxatda BIR marta chiqadi.
        self._login(first, '10.0.1.1')
        self._login(second, '10.0.1.1', days_ago=5)
        self._login(outsider, '10.0.1.2')
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse('admin-shared-ip-detail', args=['10.0.1.1']))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['ip_address'], '10.0.1.1')
        self.assertEqual(
            [a['user_id'] for a in res.data['accounts']],
            [first.id, second.id],
        )
        row = res.data['accounts'][0]
        self.assertEqual(row['full_name'], 'Birinchi')
        self.assertEqual(row['phone'], first.normalized_phone)
        self.assertTrue(row['is_active'])
        self.assertIsNotNone(row['last_login_at'])

    def test_detail_ignores_window_and_lists_old_logins(self):
        # Ro'yxatdan farqli o'laroq detalda vaqt oynasi yo'q: admin aniq IP'ni
        # tekshirmoqda va to'liq javob kerak.
        user = self._user('4100')
        self._login(user, '10.0.1.3', days_ago=400)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse('admin-shared-ip-detail', args=['10.0.1.3']))
        self.assertEqual(len(res.data['accounts']), 1)
        self.assertEqual(res.data['accounts'][0]['user_id'], user.id)

    def test_detail_unknown_ip_is_empty_not_404(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse('admin-shared-ip-detail', args=['10.9.9.9']))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['accounts'], [])

    def test_detail_accepts_ipv6_address_with_colons(self):
        # `<str:ip_address>` konvertori ikki nuqtali manzilni ham qamraydi —
        # aks holda IPv6 kirishlar umuman ochilmasdi.
        user = self._user('4200')
        self._login(user, '2001:db8::1')
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse('admin-shared-ip-detail', args=['2001:db8::1']))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['ip_address'], '2001:db8::1')
        self.assertEqual([a['user_id'] for a in res.data['accounts']], [user.id])
        # Panel manzilni `encodeURIComponent` bilan yuboradi (`:` → `%3A`) —
        # yo'l Django'ga yetib kelguncha dekodlanadi va bir xil ishlaydi.
        res = self.client.get('/api/admin/security/shared-ip/2001%3Adb8%3A%3A1/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([a['user_id'] for a in res.data['accounts']], [user.id])

    def test_detail_non_admin_is_forbidden(self):
        self.client.force_authenticate(user=self._user('4300'))
        res = self.client.get(reverse('admin-shared-ip-detail', args=['10.0.1.1']))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
