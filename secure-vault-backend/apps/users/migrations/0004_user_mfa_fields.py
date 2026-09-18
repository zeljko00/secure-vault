from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_refreshtoken'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='mfa_secret',
            field=models.TextField(blank=True, null=True),
        ),
    ]