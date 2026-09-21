from django.urls import path

from apps.user_secrets.views import (
    MySecretsView,
    MySharedSecretsView,
    MyReceivedSecretsView,
    SecretAuditLogsView,
    SecretsView,
    SecretView,
    PublicSecretView,
    HoneypotView,
    ShareSecretView,
    SharedSecretView,
    AuditLogIntegrityCheckView,
)

urlpatterns = [
    path("", SecretsView.as_view(), name="add-secret"),
    path("me/", MySecretsView.as_view(), name="my-secrets"),
    path("shared/by-me/", MySharedSecretsView.as_view(), name="my-shared-secrets"),
    path("shared/with-me/", MyReceivedSecretsView.as_view(), name="my-received-secrets"),
    path("<uuid:id>/", SecretView.as_view(), name="secret"),
    path("public/", HoneypotView.as_view(), name="public-secrets"),
    path("<str:user_id>/secret/<str:secret_id>/", PublicSecretView.as_view(), name="secrets"),
    path("<uuid:id>/share", ShareSecretView.as_view(), name="share-secret"),
    path("shared/<uuid:id>", SharedSecretView.as_view(), name="revoke-shared-secret"),
    path("access-logs/", SecretAuditLogsView.as_view(), name="secret-access-logs"),
    path("audit-integrity/", AuditLogIntegrityCheckView.as_view(), name="audit-integrity-check"),
]