"""Tests for the public AI support chat endpoint (``/api/support/chat/``).

The view is ``AllowAny`` and calls Gemini SYNCHRONOUSLY inside the request,
looping over models x API keys. With only a handful of gunicorn threads on the
whole server, an unbounded loop here starves every other request (login,
dashboard), so the wall-clock ceiling is a load-bearing property — these tests
pin it down.
"""
import json
import socket
import time
from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SupportMessage
from accounts.views_support import (
    _SUPPORT_CHAT_PER_REQUEST_TIMEOUT,
    _SUPPORT_CHAT_TOTAL_TIME_BUDGET,
)


class _FakeGeminiResponse:
    """Minimal stand-in for the object ``urllib.request.urlopen`` returns."""

    def __init__(self, text):
        self._payload = json.dumps({
            'candidates': [{'content': {'parts': [{'text': text}]}}],
        }).encode('utf-8')

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


@override_settings(
    AI_QUESTION_GEMINI_API_KEYS=['test-key'],
    AI_QUESTION_GEMINI_API_KEY='',
)
class SupportChatTimeBudgetTestCase(APITestCase):
    """Gemini javob bermay qolganda so'rov qancha vaqt ushlanishi."""

    def setUp(self):
        self.url = reverse('support-chat')
        self.payload = {
            'messages': [{'role': 'user', 'parts': [{'text': 'Salom'}]}],
        }

    def test_worst_case_bound_is_documented_by_constants(self):
        """Byudjet tekshiruvi urlopen'dan OLDIN — eng yomon holat = budget + timeout.

        Avvalgi qiymatlar (25 + 10) bitta anonim tashrifchiga 35 sekundlik
        thread band qilish imkonini berardi.
        """
        self.assertEqual(_SUPPORT_CHAT_PER_REQUEST_TIMEOUT, 4)
        self.assertEqual(_SUPPORT_CHAT_TOTAL_TIME_BUDGET, 8)
        self.assertLessEqual(
            _SUPPORT_CHAT_TOTAL_TIME_BUDGET + _SUPPORT_CHAT_PER_REQUEST_TIMEOUT,
            12,
        )

    def test_hanging_gemini_does_not_hold_thread_for_35s(self):
        """Har bir urinish timeout'gacha osilib qolsa ham so'rov tez tugaydi.

        Mock har chaqiruvda unga berilgan `timeout` qadar HAQIQATAN uxlaydi —
        ya'ni bu wall-clock o'lchovi, sanaladigan urinishlar emas. Eski
        qiymatlar bilan bu ~30+ sekund bo'lardi.
        """
        def fake_urlopen(request, timeout=None):
            time.sleep(timeout)
            raise socket.timeout('timed out')

        with patch('urllib.request.urlopen', side_effect=fake_urlopen) as mock_open:
            started = time.monotonic()
            response = self.client.post(self.url, self.payload, format='json')
            elapsed = time.monotonic() - started

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertLess(elapsed, 15, f'support_chat {elapsed:.1f}s ushlab turdi')
        # Fallback tsikli haqiqatan aylandi (test bekorga o'tib ketmadi),
        # lekin byudjet uni to'xtatdi — 6 ta model x 1 kalit emas.
        self.assertGreaterEqual(mock_open.call_count, 2)
        self.assertLess(mock_open.call_count, 6)
        for call in mock_open.call_args_list:
            self.assertEqual(call.kwargs['timeout'], _SUPPORT_CHAT_PER_REQUEST_TIMEOUT)

    def test_happy_path_answers_on_first_attempt(self):
        """Normal javobda qo'shimcha kechikish/fallback yo'q (regressiya emas)."""
        with patch(
            'urllib.request.urlopen',
            return_value=_FakeGeminiResponse('Assalomu alaykum!'),
        ) as mock_open:
            started = time.monotonic()
            response = self.client.post(self.url, self.payload, format='json')
            elapsed = time.monotonic() - started

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['reply'], 'Assalomu alaykum!')
        self.assertEqual(mock_open.call_count, 1)
        self.assertLess(elapsed, 2)
        self.assertEqual(
            SupportMessage.objects.filter(role='model').count(), 1,
        )
