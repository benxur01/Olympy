"""Markaz do'koni — o'quvchi ko'rinishi URL'lari.

Mounted under `/api/shop/`.
"""
from django.urls import path

from . import views_shop

urlpatterns = [
    path('products/', views_shop.student_shop_products, name='student-shop-products'),
]
