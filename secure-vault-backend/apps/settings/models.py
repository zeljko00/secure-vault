from django.db import models

# Create your models here.
class Setting(models.Model):
    key = models.CharField(max_length=255, primary_key=True)
    value = models.TextField()

    def __str__(self):
        return f"{self.key}: {self.value}"