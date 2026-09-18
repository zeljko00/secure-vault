from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_user_mfa_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='mfa_setup_pending',
            field=models.BooleanField(default=False),
        ),
    ]