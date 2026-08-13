from django.db import models

class UserRole(models.TextChoices):
    ADMIN = "admin", "Admin"
    DEVELOPER = "dev", "Developer"
    TEAM_LEAD = "tl", "Team Lead"
    GUEST = "guest", "Guest"
    
class Team(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(unique=True, blank=False, null=False, max_length=100)
    description = models.TextField(blank=True, null=True)
    
    def __str__(self):
        return self.name

class User(models.Model):
    id = models.AutoField(primary_key=True)
    username = models.CharField(unique=True, blank=False, null=False, max_length=150)
    role = models.CharField(blank=False, choices=UserRole.choices, default=UserRole.GUEST, max_length=20)
    email = models.EmailField(unique=True, blank=False, null=False)
    password_hash = models.CharField(blank=False, null=False, max_length=128)
    pub_key = models.TextField(blank=False, null=False)
    join_timestamp = models.DateTimeField(auto_now_add=True, editable=False, blank=False, null=False)
    
    teams = models.ManyToManyField(Team, related_name="users", blank=True)

    def __str__(self):
        return self.username
    
class UserDeactivationLog(models.Model):
    id = models.AutoField(primary_key=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="deactivation_log")
    timestamp = models.DateTimeField(auto_now_add=True, editable=False, blank=False)
    reason = models.TextField(blank=True, null=True, max_length=500)