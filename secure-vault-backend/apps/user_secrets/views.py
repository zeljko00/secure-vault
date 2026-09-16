from django.db.models import Q
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.utils import timezone
import secrets as random_secrets
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from redis.exceptions import RedisError
from rest_framework.permissions import AllowAny


from apps.user_secrets.models import Secret, SecretType, SharedSecret, SecretAccessLog, HoneypotSecretAccessLog
from apps.user_secrets.serializers import (
    SecretSerializer,
    OwnedSharedSecretSerializer,
    SharedSecretSerializer,
    ReceivedSharedSecretSerializer,
    SecretAccessLogSerializer,
)
from apps.users.models import RefreshToken, User, UserDeactivationLog
from apps.settings.models import Setting
from util.redis_client import get_redis_client
from util.request import get_client_ip
from django.contrib.auth.hashers import Argon2PasswordHasher

from util.authorization import CanManageSecrets, IsAdmin, CanManageSecret, CanManageSharedSecret, CanManageSharedSecrets, CanManageReceivedSecrets

def is_honeypot(secret, user: User, request) -> bool:
    ip_address = get_client_ip(request)
    argon2 = Argon2PasswordHasher()
    try:
        argon2.verify("honeypot", secret.marker)
        print("==========================================")
        print(f"Honeypot secret accessed by user ({user}) from IP {ip_address}. Logging access and notifying admins.")
        print("==========================================")

        HoneypotSecretAccessLog.objects.create(
            secret=secret,
            user=user,
            ip_address=ip_address
        )
        
        if not UserDeactivationLog.objects.filter(user=user).exists():
            UserDeactivationLog.objects.create(
                user=user,
                reason="Accessed honeypot secret",
            )
            RefreshToken.objects.filter(user=user).update(revoked=True)

        admin_emails = list(
            User.objects.filter(role="admin")
            .exclude(email__isnull=True)
            .exclude(email__exact="")
            .values_list("email", flat=True)
            .distinct()
        )

        if admin_emails:
            access_time = timezone.localtime(timezone.now()).strftime("%Y-%m-%d %H:%M:%S %Z")
            subject = f"[SecureVault] Honeypot accessed: {secret.label}"
            message = (
                "A honeypot secret was accessed.\n\n"
                f"Secret ID: {secret.id}\n"
                f"Secret label: {secret.label}\n"
                f"Accessed by: {user.username} ({user.id})\n"
                f"IP address: {ip_address or 'Unknown'}\n"
                f"Time: {access_time}\n"
                f"Endpoint: {request.path}\n"
            )

            send_mail(
                subject=subject,
                message=message,
                from_email=None,
                recipient_list=admin_emails,
                fail_silently=True,
            )
        
        return True
    except ValueError:
        return False


def generate_honeypot_secret_data() -> dict[str, str]:
    secret_type = random_secrets.choice([
        type[0] for type in SecretType.choices
    ])

    label_prefix = {
        SecretType.PASSWORD: "root-password",
        SecretType.API_KEY: "service-api-key",
        SecretType.CERTIFICATE: "internal-certificate",
        SecretType.OTHER: "private-note",
    }[secret_type]

    return {
        "type": secret_type,
        "label": f"{label_prefix}-{random_secrets.token_hex(4)}",
        "value": random_secrets.token_urlsafe(48),
        "marker": "honeypot",
        "iv": random_secrets.token_hex(8),
    }

class MySecretsView(APIView):
    permission_classes = [IsAuthenticated, CanManageSecrets]

    def get(self, request):
        secrets = Secret.objects.filter(owner=request.user)
        serializer = SecretSerializer(secrets, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SecretAccessLogsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    
    def get(self, request):

        access_logs = (
            SecretAccessLog.objects.select_related("secret", "secret__owner", "user")
            .order_by("-timestamp")
        )
        serializer = SecretAccessLogSerializer(access_logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SecretsView(APIView):
    permission_classes = [IsAuthenticated, CanManageSecrets]

    def post(self, request):
        serializer = SecretSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(owner=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SecretView(APIView):
    permission_classes = [IsAuthenticated, CanManageSecret]

    def put(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        serializer = SecretSerializer(secret, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        secret.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicSecretView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    
    def get(self, request, user_id, secret_id):
        # Check if endpoint is enabled
        enabled = Setting.objects.filter(key="hidden_endpoint_enabled").first()
        if not enabled or enabled.value != "true":
            return Response(status=status.HTTP_404_NOT_FOUND)

        secret = get_object_or_404(Secret, id=secret_id)
        user = get_object_or_404(User, id=user_id)
        
        # Log honeypot access if marked
        is_honeypot(secret, user, request)
        
        serializer = SecretSerializer(secret)
        return Response(serializer.data, status=status.HTTP_200_OK)
class HoneypotView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        # Check if endpoint is enabled
        enabled = Setting.objects.filter(key="hidden_endpoint_enabled").first()
        if not enabled or enabled.value != "true":
            return Response(status=status.HTTP_404_NOT_FOUND)

        data = generate_honeypot_secret_data()
        serializer = SecretSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        secret = serializer.save(owner=request.user)
        
        return Response(SecretSerializer(secret).data, status=status.HTTP_201_CREATED)
    
class ShareSecretView(APIView):
    permission_classes = [IsAuthenticated, CanManageSharedSecret]

    def post(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        self.check_object_permissions(request, secret)
        
        secret_ciphertext = request.data.get("cipher_text")

        serializer = SharedSecretSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not secret_ciphertext:
            return Response(
                {"detail": "cipher_text is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shared = serializer.save(secret=secret)

        try:
            redis_client = get_redis_client()
            ttl_seconds = (
                int((shared.sharing_expires_at - timezone.now()).total_seconds())
                if shared.sharing_expires_at
                else None
            )

            if ttl_seconds:
                redis_client.set(str(shared.id), secret_ciphertext, ex=ttl_seconds)
            else:
                redis_client.set(str(shared.id), secret_ciphertext)

            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except (RedisError, ValueError):
            shared.delete()
            return Response(
                {"detail": "Failed to store shared secret."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class SharedSecretView(APIView):
    permission_classes = [IsAuthenticated, CanManageSharedSecret]

    def get(self, request, id):
        shared = get_object_or_404(
            SharedSecret, id=id
        )
        self.check_object_permissions(request, shared)
        
        SecretAccessLog.objects.create(
            secret=shared.secret,
            user_id=request.user.id,
            ip_address=get_client_ip(request)
        )

        if shared.sharing_revoked:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if shared.sharing_expires_at and shared.sharing_expires_at <= timezone.now():
            return Response(
                {"detail": "Shared secret expired or unavailable."},
                status=status.HTTP_410_GONE,
            )

        redis_client = get_redis_client()
        payload = redis_client.get(str(shared.id))
        if not payload:
            return Response(
                {"detail": "Shared secret expired or unavailable."},
                status=status.HTTP_410_GONE,
            )

        if isinstance(payload, bytes):
            payload = payload.decode("utf-8")

        return Response({**SharedSecretSerializer(shared).data, "cipher_text": payload}, status=status.HTTP_200_OK)

    def delete(self, request, id):
        shared = get_object_or_404(SharedSecret, id=id)
        shared.sharing_revoked = True
        shared.save()
        get_redis_client().delete(str(shared.id))
        return Response(status=status.HTTP_204_NO_CONTENT)

class MySharedSecretsView(APIView):
    permission_classes = [IsAuthenticated, CanManageSharedSecrets]

    def get(self, request):

        shared_queryset_1 = (
            SharedSecret.objects
            .filter(secret__owner=request.user, sharing_revoked=False, sharing_expires_at__gt=timezone.now())
            .select_related("secret", "sharing_with")
            .order_by("secret__label", "sharing_with__username")
        )
        shared_queryset_2 = (
            SharedSecret.objects
            .filter(secret__owner=request.user, sharing_revoked=False, sharing_expires_at__isnull=True)
            .select_related("secret", "sharing_with")
            .order_by("secret__label", "sharing_with__username")
        )
        serializer = OwnedSharedSecretSerializer(list(shared_queryset_1) + list(shared_queryset_2), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class MyReceivedSecretsView(APIView):
    permission_classes = [IsAuthenticated, CanManageReceivedSecrets]

    def get(self, request):
        shared_queryset = (
            SharedSecret.objects.filter(
                sharing_with=request.user,
                sharing_revoked=False,
            )
            .filter(Q(sharing_expires_at__isnull=True) | Q(sharing_expires_at__gt=timezone.now()))
            .order_by("secret__owner__username", "secret__label")
        )
        serializer = ReceivedSharedSecretSerializer(shared_queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
class HoneypotAccessLogsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):

        access_logs = (
            HoneypotSecretAccessLog.objects.order_by("-timestamp")
        )
        serializer = SecretAccessLogSerializer(access_logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)