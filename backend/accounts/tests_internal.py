"""Tests for internal server-to-server endpoints (introspection, duel-result).

These back the Java "Brain Battles" duel service: JWT introspection and the
finished-duel result ingest. Both are gated by the ``X-Internal-Service-Secret``
header (``settings.INTERNAL_SERVICE_SECRET``).
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.views import _jwt_payload
from attempts.models import DuelResult, QuizResult

User = get_user_model()

SECRET = 'test-internal-secret-123'
HDR = {'HTTP_X_INTERNAL_SERVICE_SECRET': SECRET}


@override_settings(INTERNAL_SERVICE_SECRET=SECRET)
class IntrospectTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            phone='+998901112233', password='pw', full_name='Ali Valiyev',
        )
        self.url = reverse('internal-introspect')

    def _token(self, user):
        return _jwt_payload(user)['token']

    def test_valid_token_returns_valid_true(self):
        resp = self.client.post(
            self.url, {'token': self._token(self.user)}, format='json', **HDR,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['valid'])
        self.assertEqual(resp.data['user_id'], self.user.id)
        self.assertEqual(resp.data['phone'], self.user.phone)

    def test_tampered_token_returns_valid_false(self):
        token = self._token(self.user) + 'garbage'
        resp = self.client.post(self.url, {'token': token}, format='json', **HDR)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['valid'])

    def test_garbage_token_returns_valid_false(self):
        resp = self.client.post(
            self.url, {'token': 'not-a-jwt-at-all'}, format='json', **HDR,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['valid'])

    def test_missing_token_returns_valid_false(self):
        resp = self.client.post(self.url, {}, format='json', **HDR)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['valid'])

    def test_stale_token_after_version_bump_returns_valid_false(self):
        # Token minted at the current version, then version bumped (e.g. logout
        # / admin block). OlympyJWTAuthentication.get_user() must reject it.
        token = self._token(self.user)
        self.user.token_version = (self.user.token_version or 0) + 1
        self.user.save(update_fields=['token_version'])
        resp = self.client.post(self.url, {'token': token}, format='json', **HDR)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['valid'])

    def test_inactive_user_returns_valid_false(self):
        token = self._token(self.user)
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        resp = self.client.post(self.url, {'token': token}, format='json', **HDR)
        self.assertFalse(resp.data['valid'])

    def test_missing_secret_is_forbidden(self):
        resp = self.client.post(
            self.url, {'token': self._token(self.user)}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_wrong_secret_is_forbidden(self):
        resp = self.client.post(
            self.url, {'token': self._token(self.user)}, format='json',
            HTTP_X_INTERNAL_SERVICE_SECRET='wrong',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(INTERNAL_SERVICE_SECRET='')
class IntrospectFailClosedTestCase(APITestCase):
    def test_no_configured_secret_rejects_everything(self):
        user = User.objects.create_user(phone='+998900000000', password='pw')
        resp = self.client.post(
            reverse('internal-introspect'),
            {'token': _jwt_payload(user)['token']},
            format='json',
            HTTP_X_INTERNAL_SERVICE_SECRET='',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(INTERNAL_SERVICE_SECRET=SECRET, JWT_EXPOSE_TOKENS_IN_BODY=False)
class RealtimeTokenTestCase(APITestCase):
    """Jonli viktorina oqimi: cookie-only sessiyadan xom JWT olish.

    Production'da JWT faqat HttpOnly cookie'da yashaydi — frontend uni o'qiy
    olmaydi, Java real-time xizmatga esa token so'rov body'sida / WebSocket
    query'sida uzatilishi shart (cookie boshqa origin'ga bormaydi). Shu
    endpoint bo'lmaganda klient bo'sh token yuborardi va xona yaratishda
    "Invalid token" (401) chiqardi.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            phone='+998901114400', password='pw', full_name='Ustoz Aziz',
        )
        self.url = reverse('realtime-token')

    def _login_with_cookie_only(self):
        """Faqat HttpOnly access cookie — Authorization header YO'Q."""
        self.client.cookies[settings.JWT_ACCESS_COOKIE_NAME] = _jwt_payload(self.user)['token']

    def test_anonymous_is_rejected(self):
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cookie_session_returns_token_that_introspect_accepts(self):
        self._login_with_cookie_only()
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['token'])
        self.assertGreater(resp.data['expires_in'], 0)

        # Aynan Java xizmat bosadigan yo'l (DjangoClient.introspect).
        introspect = self.client.post(
            reverse('internal-introspect'),
            {'token': resp.data['token']}, format='json', **HDR,
        )
        self.assertTrue(introspect.data['valid'])
        self.assertEqual(introspect.data['user_id'], self.user.id)

    def test_refresh_token_is_never_exposed(self):
        self._login_with_cookie_only()
        resp = self.client.post(self.url)
        self.assertNotIn('refresh', resp.data)

    def test_token_is_revoked_by_version_bump(self):
        self._login_with_cookie_only()
        token = self.client.post(self.url).data['token']
        self.user.token_version = (self.user.token_version or 0) + 1
        self.user.save(update_fields=['token_version'])
        introspect = self.client.post(
            reverse('internal-introspect'), {'token': token}, format='json', **HDR,
        )
        self.assertFalse(introspect.data['valid'])


@override_settings(INTERNAL_SERVICE_SECRET=SECRET)
class DuelResultTestCase(APITestCase):
    def setUp(self):
        self.p1 = User.objects.create_user(phone='+998901112201', password='pw', full_name='P1')
        self.p2 = User.objects.create_user(phone='+998901112202', password='pw', full_name='P2')
        self.url = reverse('internal-duel-result')

    def test_persists_result_with_winner(self):
        payload = {
            'match_id': 'm-abc',
            'player1_id': self.p1.id,
            'player2_id': self.p2.id,
            'player1_score': 4,
            'player2_score': 2,
            'winner_id': self.p1.id,
            'subject': 'Matematika',
        }
        resp = self.client.post(self.url, payload, format='json', **HDR)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        row = DuelResult.objects.get(pk=resp.data['id'])
        self.assertEqual(row.match_id, 'm-abc')
        self.assertEqual(row.player1_score, 4)
        self.assertEqual(row.winner_id, self.p1.id)
        self.assertEqual(row.subject, 'Matematika')

    def test_draw_null_winner(self):
        payload = {
            'player1_id': self.p1.id, 'player2_id': self.p2.id,
            'player1_score': 3, 'player2_score': 3, 'winner_id': None,
        }
        resp = self.client.post(self.url, payload, format='json', **HDR)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(DuelResult.objects.get(pk=resp.data['id']).winner_id)

    def test_missing_secret_forbidden(self):
        resp = self.client.post(
            self.url,
            {'player1_id': self.p1.id, 'player2_id': self.p2.id,
             'player1_score': 1, 'player2_score': 0},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_player_404(self):
        resp = self.client.post(
            self.url,
            {'player1_id': self.p1.id, 'player2_id': 999999,
             'player1_score': 1, 'player2_score': 0},
            format='json', **HDR,
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_winner_not_participant_400(self):
        resp = self.client.post(
            self.url,
            {'player1_id': self.p1.id, 'player2_id': self.p2.id,
             'player1_score': 1, 'player2_score': 0, 'winner_id': 424242},
            format='json', **HDR,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(INTERNAL_SERVICE_SECRET=SECRET)
class QuizResultTestCase(APITestCase):
    def setUp(self):
        self.host = User.objects.create_user(phone='+998901113301', password='pw', full_name='Ustoz')
        self.s1 = User.objects.create_user(phone='+998901113302', password='pw', full_name='Ali')
        self.s2 = User.objects.create_user(phone='+998901113303', password='pw', full_name='Vali')
        self.url = reverse('internal-quiz-result')

    def _payload(self):
        return {
            'room_code': '482913',
            'title': 'Matematika viktorina',
            'host_id': self.host.id,
            'participants': [
                {'user_id': self.s1.id, 'name': 'Ali', 'score': 1850, 'rank': 1},
                {'user_id': self.s2.id, 'name': 'Vali', 'score': 1200, 'rank': 2},
            ],
        }

    def test_persists_leaderboard(self):
        resp = self.client.post(self.url, self._payload(), format='json', **HDR)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        row = QuizResult.objects.get(pk=resp.data['id'])
        self.assertEqual(row.room_code, '482913')
        self.assertEqual(row.title, 'Matematika viktorina')
        self.assertEqual(row.host_id, self.host.id)
        self.assertEqual(len(row.participants), 2)
        self.assertEqual(row.participants[0]['name'], 'Ali')
        self.assertEqual(row.participants[0]['score'], 1850)
        self.assertEqual(row.participants[0]['rank'], 1)

    def test_unknown_host_stored_as_null(self):
        payload = self._payload()
        payload['host_id'] = 999999
        resp = self.client.post(self.url, payload, format='json', **HDR)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(QuizResult.objects.get(pk=resp.data['id']).host_id)

    def test_empty_participants_400(self):
        payload = self._payload()
        payload['participants'] = []
        resp = self.client.post(self.url, payload, format='json', **HDR)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_malformed_participant_400(self):
        payload = self._payload()
        payload['participants'] = [{'name': 'no id'}]
        resp = self.client.post(self.url, payload, format='json', **HDR)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_secret_forbidden(self):
        resp = self.client.post(self.url, self._payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_wrong_secret_forbidden(self):
        resp = self.client.post(
            self.url, self._payload(), format='json',
            HTTP_X_INTERNAL_SERVICE_SECRET='wrong',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
