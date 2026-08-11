from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework import status

from centers.models import EducationCenter
from .models import PushSubscription
from .services import send_olympiad_published_notification, send_web_push

User = get_user_model()

class WebPushTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            phone='+998901234567',
            password='testpassword123',
            full_name='Test User'
        )
        self.client.force_authenticate(user=self.user)

    def _subscribe(self, endpoint):
        return self.client.post('/api/notifications/subscribe/', {
            'endpoint': endpoint,
            'keys': {
                'p256dh': 'BIPMX4...',
                'auth': '5sT...'
            }
        }, format='json')

    def test_subscribe_push(self):
        response = self._subscribe(
            'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA...',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(PushSubscription.objects.filter(user=self.user).exists())

    def test_subscribe_accepts_fcm_endpoint(self):
        response = self._subscribe('https://fcm.googleapis.com/fcm/send/abc123')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            PushSubscription.objects.filter(
                endpoint='https://fcm.googleapis.com/fcm/send/abc123',
            ).exists()
        )

    def test_subscribe_accepts_wildcard_subdomain(self):
        """`*.notify.windows.com` — haqiqiy subdomen qabul qilinadi."""
        response = self._subscribe('https://foo.notify.windows.com/x')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            PushSubscription.objects.filter(
                endpoint='https://foo.notify.windows.com/x',
            ).exists()
        )

    def test_subscribe_rejects_internal_metadata_endpoint(self):
        """SSRF: bulut metadata manzili saqlanmasligi kerak (400)."""
        response = self._subscribe('http://169.254.169.254/latest/meta-data/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PushSubscription.objects.exists())

    def test_subscribe_rejects_arbitrary_host(self):
        response = self._subscribe('https://evil.example.com/push')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PushSubscription.objects.exists())

    def test_subscribe_rejects_wildcard_suffix_lookalike(self):
        """`evilnotify.windows.com` — `notify.windows.com` bilan TUGAYDI, lekin
        uning subdomeni emas. Sodda `endswith` bu hujumni o'tkazib yuborardi."""
        response = self._subscribe('https://evilnotify.windows.com/x')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PushSubscription.objects.exists())

    def test_subscribe_rejects_userinfo_bypass(self):
        """`https://fcm.googleapis.com@evil.tld/` — haqiqiy host `evil.tld`."""
        response = self._subscribe('https://fcm.googleapis.com@evil.example.com/x')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PushSubscription.objects.exists())

    @override_settings(PUSH_ENDPOINT_ALLOWED_HOSTS=['push.olympy.uz'])
    def test_allowlist_is_configurable_via_settings(self):
        """settings orqali berilgan ro'yxat default'ning o'rniga ishlaydi."""
        self.assertEqual(
            self._subscribe('https://push.olympy.uz/send/1').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self._subscribe('https://fcm.googleapis.com/fcm/send/abc').status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    @override_settings(VAPID_PRIVATE_KEY='test-vapid-private-key-not-for-prod')
    @patch('pywebpush.webpush')
    def test_send_web_push_skips_disallowed_stored_endpoint(self, mock_webpush):
        """Chuqurlikda himoya: validatsiyadan oldin saqlangan yozuvga
        yuborilmaydi (`.objects.create` view'ni chetlab o'tadi)."""
        subscription = PushSubscription.objects.create(
            user=self.user,
            endpoint='http://169.254.169.254/latest/meta-data/',
            p256dh='fake_p256dh',
            auth='fake_auth',
        )

        self.assertFalse(send_web_push(subscription, 'Sarlavha', 'Matn'))
        mock_webpush.assert_not_called()

    @override_settings(VAPID_PRIVATE_KEY='test-vapid-private-key-not-for-prod')
    @patch('pywebpush.webpush')
    def test_send_web_push_on_publish(self, mock_webpush):
        # Create a subscription
        subscription = PushSubscription.objects.create(
            user=self.user,
            endpoint='https://fcm.googleapis.com/fcm/send/fake',
            p256dh='fake_p256dh',
            auth='fake_auth'
        )
        
        # Create a center in DB
        center = EducationCenter.objects.create(
            name='Test Center',
            owner=self.user
        )

        # Mock class for olympiad
        class MockOlympiad:
            id = 42
            title = 'Test Olympiad'
            subject = 'Matematika'
            event_type = 'olympiad'
            test_level = 'Boshlang\'ich'
            test_type = 'choice'
            TEST_TYPE_CHOICES = [('choice', 'Test')]
            start_datetime = None

        # Trigger notification
        send_olympiad_published_notification(self.user, MockOlympiad(), center)
        
        # Verify that webpush was called
        mock_webpush.assert_called_once()
        args, kwargs = mock_webpush.call_args
        self.assertEqual(kwargs['subscription_info']['endpoint'], 'https://fcm.googleapis.com/fcm/send/fake')
        self.assertIn('Test Center', kwargs['data'])

    @override_settings(VAPID_PRIVATE_KEY='test-vapid-private-key-not-for-prod')
    @patch('pywebpush.webpush')
    def test_send_web_push_uses_bounded_timeout(self, mock_webpush):
        """Javob bermayotgan push endpoint thread/task'ni cheksiz ushlamasin.

        `timeout` bo'lmasa bitta osilib qolgan endpoint fan-out'ning qolganini
        (va uni chaqirgan worker'ni) noma'lum muddatga bloklaydi.
        """
        subscription = PushSubscription.objects.create(
            user=self.user,
            endpoint='https://fcm.googleapis.com/fcm/send/slow',
            p256dh='fake_p256dh',
            auth='fake_auth',
        )

        self.assertTrue(send_web_push(subscription, 'Sarlavha', 'Matn'))

        mock_webpush.assert_called_once()
        _, kwargs = mock_webpush.call_args
        self.assertEqual(kwargs['timeout'], 5)
