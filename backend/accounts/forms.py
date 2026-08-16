"""Admin formalari.

AVVAL: bu yerda `User.roles` (JSONField, masalan ``['student', 'owner']``)
uchun `CheckboxSelectMultiple` widget'i bor edi — Django admin'da rollarni
qo'lda belgilash uchun.

HOZIR: `roles` (shuningdek `is_active`, `is_platform_admin`, `is_premium`,
`password`) `accounts.admin.UserAdmin.readonly_fields` da. Ular faqat o'z
audit yozuvi va tekshiruvlariga ega API amallari orqali o'zgaradi
(`admin_set_user_roles`, `admin_set_user_active`, `admin_toggle_user_premium`,
`admin_reset_user_password`) — sabab `UserAdmin` docstring'ida batafsil.

Shuning uchun roles widget'i olib tashlandi: readonly maydon forma'dan
chiqariladi, ya'ni widget hech qachon saqlanmaydigan, faqat chalg'ituvchi
boshqaruv bo'lib qolgan edi. Bu forma o'rnida qoldirildi — Django admin'ning
User sahifasiga kelajakda XAVFSIZ maydon qo'shish kerak bo'lsa, joyi shu
(rollarni qaytarish uchun EMAS).
"""
from django.contrib.auth.forms import UserChangeForm

from .models import User


class UserAdminForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User
        fields = '__all__'
