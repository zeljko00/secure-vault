from django.urls import path

from apps.user_secrets.views import (
    HoneypotAccessLogsView,
    MySecretsView,
    MySharedSecretsView,
    MyReceivedSecretsView,
    SecretAccessLogsView,
    SecretsView,
    SecretView,
    PublicSecretView,
    ShareSecretView,
    SharedSecretView,
)

urlpatterns = [
    path("", SecretsView.as_view(), name="add-secret"),
    path("me/", MySecretsView.as_view(), name="my-secrets"),
    path("shared/by-me/", MySharedSecretsView.as_view(), name="my-shared-secrets"),
    path("shared/with-me/", MyReceivedSecretsView.as_view(), name="my-received-secrets"),
    path("<uuid:id>/", SecretView.as_view(), name="secret"),
    path("<uuid:id>/public", PublicSecretView.as_view(), name="public-secret"),
    path("<uuid:id>/share", ShareSecretView.as_view(), name="share-secret"),
    path("shared/<uuid:id>", SharedSecretView.as_view(), name="revoke-shared-secret"),
    path("access-logs/", SecretAccessLogsView.as_view(), name="secret-access-logs"),
    path("access-logs/honeypots/", HoneypotAccessLogsView.as_view(), name="honeypot-secret-access-logs")
]