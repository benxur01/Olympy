from django.urls import path

from . import views

# Mounted under /api/certificates/
urlpatterns = [
    path('<int:attempt_id>/download/', views.download_certificate, name='certificate-download'),
]
