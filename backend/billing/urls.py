from django.urls import path
from . import views

urlpatterns = [
    path('checkout/', views.create_checkout_session, name='billing-checkout'),
    path('plans/', views.list_subscription_plans, name='billing-plans'),
    path('click/webhook/', views.click_webhook, name='billing-click-webhook'),
    path('payme/webhook/', views.payme_webhook, name='billing-payme-webhook'),
    path('recent/', views.recent_purchases, name='billing-recent'),
]
