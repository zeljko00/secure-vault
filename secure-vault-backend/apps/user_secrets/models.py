from django.db import models

class SecretType(models.TextChoices):
    PASSWORD = "password", "Password"
    API_KEY = "api_key", "API Key"
    CERTIFICATE = "certificate", "Certificate"
    OTHER = "other", "Other"

class Secret(models.Model):
    id = models.AutoField(primary_key=True)
    type = models.CharField(blank=False, choices=SecretType.choices, default=SecretType.OTHER, max_length=20)
    label = models.CharField(blank=False, null=False, max_length=100)
    value = models.BinaryField(blank=False, null=False)
    marker = models.CharField(blank=True, null=True, max_length=256)

    owner = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name="secrets")

    def __str__(self):
        return self.label
    
class SharedSecret(models.Model):
    id = models.AutoField(primary_key=True)
    secret = models.ForeignKey(Secret, on_delete=models.CASCADE, related_name="shared_instances")
    sharing_with = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name="received_secrets")
    sharing_expires_at = models.DateTimeField(blank=True, null=True)
    sharing_revoked = models.BooleanField(default=False)
    sharing_content_id = models.CharField(blank=False, null=False, max_length=256)

    def __str__(self):
        return f"{self.secret.owner.username} is sharing {self.secret.label} with {self.sharing_with.username}"
    
class AccessLog(models.Model):
    timestamp = models.DateTimeField(auto_now_add=True, editable=False)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    details = models.TextField(blank=True, null=True)

    class Meta:
        abstract = True
        
class HoneypotSecretAccessLog(AccessLog):
    id = models.AutoField(primary_key=True)
    secret = models.ForeignKey(Secret, on_delete=models.SET_NULL, null=True, blank=True)
    user = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True)
    
class SharedSecretAccessLog(AccessLog):
    id = models.AutoField(primary_key=True)
    secret = models.ForeignKey(SharedSecret, on_delete=models.CASCADE, null=False, blank=False)