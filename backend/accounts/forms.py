"""Admin formalari.

`User.roles` — JSONField (list), masalan ``['student', 'owner']``. Django
admin uni standart holatda xom JSON matn maydoni sifatida ko'rsatadi — bu
noqulay va xatolarga moyil (qo'lda ['...'] yozish, vergul/qo'shtirnoq xatosi).
Bu yerda uni `CheckboxSelectMultiple` (checkboxlar) bilan ko'rsatamiz: tanlangan
checkboxlar ro'yxatga aylanib JSONField'ga saqlanadi.
"""
from django import forms
from django.contrib.auth.forms import UserChangeForm

from .models import User


# `User.roles` ichida bo'lishi mumkin bo'lgan rol kalitlari. Markaz rollari
# (student/teacher/manager/owner) `centers.CenterMembership.ROLE_CHOICES` bilan
# bir xil, ammo `User.roles` qo'shimcha `admin` (platforma admini, markazsiz)
# rolini ham saqlaydi — shuning uchun ro'yxat shu yerda mustaqil belgilanadi.
ROLE_CHOICES = (
    ('student', 'Student'),
    ('teacher', 'Teacher'),
    ('manager', 'Manager'),
    ('owner', 'Owner'),
    ('admin', 'Admin'),
)


class RolesMultipleChoiceField(forms.MultipleChoiceField):
    """JSONField (list) <-> MultipleChoiceField ko'prigi.

    DB'dagi qiymat list (`['student']`) bo'lib keladi; MultipleChoiceField
    uni shundayligicha qabul qiladi va validatsiya qiladi. Saqlashda `clean`
    natijasi ham list bo'ladi — bu to'g'ridan-to'g'ri JSONField'ga yoziladi.
    """

    def clean(self, value):
        # Bo'sh tanlovni JSONField default'iga mos ravishda bo'sh list qaytaramiz.
        cleaned = super().clean(value)
        return list(cleaned or [])


class UserAdminForm(UserChangeForm):
    roles = RolesMultipleChoiceField(
        choices=ROLE_CHOICES,
        required=False,
        widget=forms.CheckboxSelectMultiple,
        label='Roles',
        help_text="Foydalanuvchining platformadagi rollari. Markaz a'zoligi "
                  "(student/teacher/manager/owner) holati alohida "
                  "CenterMembership'da boshqariladi.",
    )

    class Meta(UserChangeForm.Meta):
        model = User
        fields = '__all__'
