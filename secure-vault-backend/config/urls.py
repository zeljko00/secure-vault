"""
Routing table listing high-level (URLs, view) mappings.
"""
from django.urls import path,include

urlpatterns = [
    # base URL for users app, includes all URLs defined in apps.users.urls
    path("api/users/", include("apps.users.urls")),
    path("api/secrets/", include("apps.user_secrets.urls")),
]
