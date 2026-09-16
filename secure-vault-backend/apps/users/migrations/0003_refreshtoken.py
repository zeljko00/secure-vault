import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_alter_user_role'),
    ]

    operations = [
        migrations.CreateModel(
            name='RefreshToken',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('hash', models.CharField(max_length=255, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, editable=False)),
                ('expires_at', models.DateTimeField()),
                ('revoked', models.BooleanField(default=False)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='token', to='users.user')),
            ],
        ),
    ]