from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

# Mounted under /api/auth/
urlpatterns = [
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('phone/start-telegram-verification/', views.start_telegram_phone_verification,
         name='start-telegram-phone-verification'),
    path('phone/verify-otp/', views.verify_otp, name='verify-otp'),
]
