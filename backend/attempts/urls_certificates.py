from django.urls import path

from . import views

# Mounted under /api/certificates/
urlpatterns = [
    # Public sertifikat tekshiruvi (auth shart emas, AllowAny). UUID orqali.
    # `<int:attempt_id>/download/` dan oldin turishi shart emas, lekin aniqlik
    # uchun: `verify/<uuid>` int converterga to'qnashmaydi.
    path('verify/<uuid:cert_uuid>/', views.certificate_verify, name='certificate-verify'),
    path('<int:attempt_id>/download/', views.download_certificate, name='certificate-download'),
]
