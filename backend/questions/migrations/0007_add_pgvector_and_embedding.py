from django.db import migrations


def add_pgvector(apps, schema_editor):
    """pgvector kengaytmasi va `embedding` ustuni — faqat PostgreSQL'da.

    SQLite (lokal muhit) `vector` turini va CREATE EXTENSION'ni
    qo'llab-quvvatlamaydi, shuning uchun u yerda hech narsa qilinmaydi.
    Har bir buyruq IF NOT EXISTS bilan — qayta ishga tushirilsa ham xavfsiz.
    """
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute('CREATE EXTENSION IF NOT EXISTS vector;')
    schema_editor.execute(
        'ALTER TABLE questions_question '
        'ADD COLUMN IF NOT EXISTS embedding vector(768);'
    )
    schema_editor.execute(
        'CREATE INDEX IF NOT EXISTS questions_embedding_idx '
        'ON questions_question USING ivfflat (embedding vector_cosine_ops) '
        'WITH (lists = 100);'
    )


def remove_pgvector(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute('DROP INDEX IF EXISTS questions_embedding_idx;')
    schema_editor.execute(
        'ALTER TABLE questions_question DROP COLUMN IF EXISTS embedding;'
    )
    schema_editor.execute('DROP EXTENSION IF EXISTS vector;')


class Migration(migrations.Migration):
    """RAG uchun pgvector kengaytmasi va `embedding` ustuni.

    Maydon Django modelida emas — raw SQL ustun (vector(768)). Faqat
    PostgreSQL'da qo'llaniladi; SQLite'da o'tkazib yuboriladi.
    """

    dependencies = [
        ('questions', '0006_question_questions_q_center__10ac6f_idx'),
    ]

    operations = [
        migrations.RunPython(add_pgvector, remove_pgvector),
    ]
