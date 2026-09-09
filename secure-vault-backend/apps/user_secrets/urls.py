from django.urls import path

from apps.user_secrets.views import (
    MySecretsView,
    MyOwnedSharedSecretsView,
    MyReceivedSharedSecretsView,
    SecretAccessLogsView,
    SecretsView,
    SecretView,
    SecretDeleteView,
    ShareSecretView,
    SharedSecretView,
)

urlpatterns = [
    path("", SecretsView.as_view(), name="add-secret"),
    path("me/", MySecretsView.as_view(), name="my-secrets"),
    path("shared/me/", MyOwnedSharedSecretsView.as_view(), name="my-owned-shares"),
    path("shared/with-me/", MyReceivedSharedSecretsView.as_view(), name="my-received-shares"),
    path("<uuid:id>/", SecretView.as_view(), name="secret"),
    path("<uuid:id>/delete/", SecretDeleteView.as_view(), name="delete-secret"),
    path("<uuid:id>/share", ShareSecretView.as_view(), name="share-secret"),
    path("shared/<uuid:id>", SharedSecretView.as_view(), name="revoke-shared-secret"),
    path("access-logs/", SecretAccessLogsView.as_view(), name="secret-access-logs")
]