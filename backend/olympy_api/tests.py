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
