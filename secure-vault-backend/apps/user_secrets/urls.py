from django.urls import path

from apps.user_secrets.views import (
    SecretsView,
    SecretUpdateView,
    SecretDeleteView,
    ShareSecretView,
    SharedSecretView,
)

urlpatterns = [
    path("", SecretsView.as_view(), name="add-secret"),
    path("<uuid:id>/", SecretUpdateView.as_view(), name="update-secret"),
    path("<uuid:id>/delete/", SecretDeleteView.as_view(), name="delete-secret"),
    path("<uuid:id>/share", ShareSecretView.as_view(), name="share-secret"),
    path("shared/<uuid:id>", SharedSecretView.as_view(), name="revoke-shared-secret")
]