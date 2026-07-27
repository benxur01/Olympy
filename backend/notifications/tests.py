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

    def test_subscribe_push(self):
        response = self.client.post('/api/notifications/subscribe/', {
            'endpoint': 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA...',
            'keys': {
                'p256dh': 'BIPMX4...',
                'auth': '5sT...'
            }
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(PushSubscription.objects.filter(user=self.user).exists())

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
