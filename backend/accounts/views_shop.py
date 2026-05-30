"""Markaz do'koni (Center Shop) endpointlari.

Ikki tomon:
  - Menejer/direktor (owner): o'z markazi mahsulotlarini CRUD qiladi
    (`/api/center/shop/products/...`).
  - O'quvchi: o'z markazining faol mahsulotlarini ko'radi
    (`/api/shop/products/`) va `redeem_reward` orqali xarid qiladi.

O'quvchi va menejerning markazi `CenterMembership` orqali aniqlanadi —
URL'da center_id berilmaydi, foydalanuvchining a'zoligidan kelib chiqadi.
"""
import io
import logging

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from centers.models import CenterMembership, EducationCenter
from centers.services import user_can_manage_center

from .models import RewardProduct
from .serializers import RewardProductSerializer


logger = logging.getLogger(__name__)


def _managed_center_for(user, center_id=None):
    """Foydalanuvchi (owner yoki manager) boshqaradigan markazni qaytaradi.

    `center_id` berilsa — aynan o'sha markaz tekshiriladi va foydalanuvchi
    uni boshqara olsagina qaytariladi (aks holda None). Bir nechta markazga
    ega owner/menejer uchun frontend tanlagan markazni shu orqali aniqlaydi.

    `center_id` berilmasa — avval egasi bo'lgan tasdiqlangan markazni, keyin
    manager sifatida tasdiqlangan a'zolikni tekshiradi. Bir nechta bo'lsa
    eng yangisi olinadi. Birortasi ham bo'lmasa None.
    """
    if center_id is not None:
        center = EducationCenter.objects.filter(pk=center_id).first()
        if center is not None and user_can_manage_center(user, center):
            return center
        return None
    owned = (
        EducationCenter.objects
        .filter(owner=user, status=EducationCenter.STATUS_APPROVED)
        .order_by('-created_at')
        .first()
    )
    if owned:
        return owned
    membership = (
        CenterMembership.objects
        .filter(
            user=user,
            role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
        )
        .select_related('center')
        .order_by('-created_at')
        .first()
    )
    return membership.center if membership else None


def _center_id_from_request(request):
    """request query/body'dan center_id (int) ni xavfsiz o'qiydi yoki None."""
    raw = request.query_params.get('center_id') or request.data.get('center_id')
    if raw in (None, ''):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _student_center_for(user):
    """O'quvchi a'zo bo'lgan (tasdiqlangan) markazni qaytaradi.

    Bir nechta markazda o'qiydigan o'quvchi uchun eng yangi tasdiqlangan
    student a'zoligi olinadi. Markaz yo'q bo'lsa None (global do'kon ko'rinadi).
    """
    membership = (
        CenterMembership.objects
        .filter(
            user=user,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        )
        .select_related('center')
        .order_by('-created_at')
        .first()
    )
    return membership.center if membership else None


def _validate_and_attach_image(product, request):
    """request.FILES'dan rasmni olib (bo'lsa) product.image'ga biriktiradi.

    Rasm yuborilmasa hech narsa qilmaydi (mavjud rasm saqlanadi). Yaroqsiz
    yoki juda katta rasmda xato matn (string) qaytaradi, aks holda None.
    Cloudinary yoqilgan bo'lsa ImageField avtomatik o'sha storage'ga yozadi.
    """
    image = (
        request.FILES.get('image')
        or request.FILES.get('photo')
        or request.FILES.get('file')
    )
    if not image:
        return None
    if image.content_type and not image.content_type.startswith('image/'):
        return 'Faqat rasm fayl qabul qilinadi'
    max_bytes = 5 * 1024 * 1024
    if image.size and image.size > max_bytes:
        return 'Rasm juda katta. Limit: 5 MB'
    try:
        from PIL import Image as PilImage
        PilImage.MAX_IMAGE_PIXELS = 50 * 1024 * 1024
        img = PilImage.open(io.BytesIO(image.read()))
        img.load()
        image.seek(0)
    except Exception:
        return 'Yaroqsiz rasm fayli'
    product.image = image
    return None


# ─── Menejer/direktor: mahsulot CRUD ─────────────────────────────────────────


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def center_shop_products(request):
    """GET/POST /api/center/shop/products/

    GET: joriy foydalanuvchi boshqaradigan markazning barcha mahsulotlari
         (faol va nofaol).
    POST: yangi mahsulot qo'shish. multipart/form-data bilan rasm yuklash
          mumkin. Body: title, description, coin_cost, icon, features (JSON
          yoki ro'yxat), stock, is_active.

    Ixtiyoriy `center_id` (query yoki body) — bir nechta markazga ega
    owner/menejer aniq markazni tanlashi uchun.
    """
    center = _managed_center_for(request.user, _center_id_from_request(request))
    if center is None:
        return Response(
            {'detail': "Siz hech qaysi markazni boshqarmaysiz"},
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.method == 'POST':
        serializer = RewardProductSerializer(
            data=request.data, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        product = RewardProduct(
            center=center,
            title=serializer.validated_data.get('title', ''),
            description=serializer.validated_data.get('description', ''),
            coin_cost=serializer.validated_data.get('coin_cost', 0),
            icon=serializer.validated_data.get('icon', '🎁'),
            features=serializer.validated_data.get('features', []),
            stock=serializer.validated_data.get('stock', 10),
            is_active=serializer.validated_data.get('is_active', True),
        )
        img_err = _validate_and_attach_image(product, request)
        if img_err:
            return Response({'detail': img_err}, status=status.HTTP_400_BAD_REQUEST)
        product.save()
        return Response(
            RewardProductSerializer(product, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    # GET — markaz mahsulotlari ro'yxati.
    products = RewardProduct.objects.filter(center=center).order_by('-created_at')
    return Response(
        RewardProductSerializer(products, many=True, context={'request': request}).data
    )


@api_view(['PUT', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def center_shop_product_detail(request, product_id):
    """PUT/PATCH/DELETE /api/center/shop/products/<id>/

    Menejer faqat o'z markazining mahsulotini tahrirlaydi/o'chiradi.
    Boshqa markaz yoki global (center=null) mahsulotga tegib bo'lmaydi.
    """
    center = _managed_center_for(request.user, _center_id_from_request(request))
    if center is None:
        return Response(
            {'detail': "Siz hech qaysi markazni boshqarmaysiz"},
            status=status.HTTP_403_FORBIDDEN,
        )
    # Faqat shu markazning mahsuloti — center=null (global) yoki boshqa
    # markaz mahsulotlari bu yerda ko'rinmaydi (404).
    product = RewardProduct.objects.filter(pk=product_id, center=center).first()
    if product is None:
        return Response({'detail': 'Mahsulot topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    partial = request.method == 'PATCH'
    serializer = RewardProductSerializer(
        product, data=request.data, partial=partial, context={'request': request}
    )
    serializer.is_valid(raise_exception=True)
    # center read-only — serializer saqlamaydi, ammo aniqlik uchun saqlab
    # qolamiz (mahsulot markazi o'zgarmaydi).
    serializer.save()
    img_err = _validate_and_attach_image(product, request)
    if img_err:
        return Response({'detail': img_err}, status=status.HTTP_400_BAD_REQUEST)
    if request.FILES:
        product.save(update_fields=['image'])
    return Response(
        RewardProductSerializer(product, context={'request': request}).data
    )


# ─── O'quvchi: do'konni ko'rish ──────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_shop_products(request):
    """GET /api/shop/products/

    O'quvchining markazidagi faol mahsulotlar + joriy tangalar. Markaz
    a'zoligi bo'lmasa bo'sh ro'yxat (lekin tangalar baribir qaytadi).
    """
    center = _student_center_for(request.user)
    if center is None:
        return Response({'coins': request.user.coins, 'products': []})
    products = (
        RewardProduct.objects
        .filter(center=center, is_active=True, stock__gt=0)
        .order_by('-created_at')
    )
    return Response({
        'coins': request.user.coins,
        'center_id': center.id,
        'center_name': center.name,
        'products': RewardProductSerializer(
            products, many=True, context={'request': request}
        ).data,
    })
