# Yangi savol turlari uchun: question_type max_length oshirildi va matn/JSON
# javob saqlovchi correct_text maydoni qo'shildi. Qo'lda yozildi (muhit
# Django'ni ishga tushira olmaydi).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('questions', '0007_add_pgvector_and_embedding'),
    ]

    operations = [
        migrations.AddField(
            model_name='question',
            name='correct_text',
            field=models.TextField(
                blank=True,
                default='',
                help_text="fill_blank/fill_blanks/multiple_select to'g'ri javobi (matn yoki JSON)",
            ),
        ),
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
                ],
                db_index=True,
                default='mcq',
                max_length=20,
            ),
        ),
    ]
