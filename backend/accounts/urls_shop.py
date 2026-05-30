"""Markaz do'koni — menejer/direktor CRUD URL'lari.

Mounted under `/api/center/shop/`.
"""
from django.urls import path

from . import views_shop

urlpatterns = [
    path('products/', views_shop.center_shop_products, name='center-shop-products'),
    path('products/<int:product_id>/', views_shop.center_shop_product_detail,
         name='center-shop-product-detail'),
]
