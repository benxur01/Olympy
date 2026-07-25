# Jonli viktorina (Kahoot uslubi) uchun yangi `slider` savol turi qo'shildi.
# Faqat metadata o'zgarishi: `choices` ro'yxatiga bitta element qo'shildi,
# jadval strukturasi (ustunlar) o'zgarmaydi. Slayder sozlamasi mavjud
# `correct_text` maydonida JSON bo'lib saqlanadi, shu sababli yangi ustun yo'q.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('questions', '0010_question_is_active'),
    ]

    operations = [
        migrations.AlterField(
            model_name='question',
            name='question_type',
            field=models.CharField(
                choices=[
                    ('mcq', 'Test (variantli)'),
                    ('code', 'Kod (dasturlash)'),
                    ('multiple_select', 'Multiple Select'),
                    ('yes_no', "Ha / Yo'q"),
                    ('essay', 'Essay (Katta matn)'),
                    ('fill_blank', "Bo'sh joy to'ldirish"),
                    ('fill_blanks', "Ko'p bo'sh joy to'ldirish"),
                    ('slider', 'Slayder (raqamli)'),
                ],
                db_index=True,
                default='mcq',
                max_length=20,
            ),
        ),
    ]
