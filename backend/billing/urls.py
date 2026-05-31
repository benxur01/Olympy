from django.urls import path
from . import views

urlpatterns = [
    path('checkout/', views.create_checkout_session, name='billing-checkout'),
    path('click/webhook/', views.click_webhook, name='billing-click-webhook'),
    path('payme/webhook/', views.payme_webhook, name='billing-payme-webhook'),
]
