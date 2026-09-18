from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0005_user_mfa_setup_pending'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='device_id',
            field=models.TextField(blank=True, null=True),
        ),
    ]