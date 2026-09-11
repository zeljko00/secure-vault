from django.db.models import Q
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from redis.exceptions import RedisError

from apps.user_secrets.models import Secret, SharedSecret, SecretAccessLog, HoneypotSecretAccessLog
from apps.user_secrets.serializers import (
    SecretSerializer,
    OwnedSharedSecretSerializer,
    SharedSecretSerializer,
    ReceivedSharedSecretSerializer,
    SecretAccessLogSerializer,
)
from apps.users.models import User, UserDeactivationLog
from apps.settings.models import Setting
from util.redis_client import get_redis_client


def get_request_user(request):
    user_id = request.query_params.get("user")
    if not user_id:
        return None
    return get_object_or_404(User, id=user_id)

def is_honeypot(secret, user: User, request) -> bool:
    is_marked = (secret.marker == "honeypot")
    ip_address = request.META.get("X-Forwarded-For", request.META.get("REMOTE_ADDR", "")).split(",")[0].strip()
    
    if is_marked:
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
            
            print(f"Sending honeypot access email to: {', '.join(admin_emails)}")

            send_mail(
                subject=subject,
                message=message,
                from_email=None,
                recipient_list=admin_emails,
                fail_silently=True,
            )

    return is_marked

class MySecretsView(APIView):
    def get(self, request):
        # Temporary user lookup by query param until auth/session wiring is in place.
        user_id = request.query_params.get("user")
        if not user_id:
            return Response(
                {"detail": "user query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(User, id=user_id)
        secrets = Secret.objects.filter(owner=user)
        serializer = SecretSerializer(secrets, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SecretAccessLogsView(APIView):
    def get(self, request):
        request_user = get_request_user(request)
        if request_user is None:
            return Response(
                {"detail": "user query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request_user.role != "admin":
            return Response(status=status.HTTP_403_FORBIDDEN)

        access_logs = (
            SecretAccessLog.objects.select_related("secret", "secret__owner", "user")
            .order_by("-timestamp")
        )
        serializer = SecretAccessLogSerializer(access_logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SecretsView(APIView):
    def get(self, request):
        secrets = Secret.objects.all()
        serializer = SecretSerializer(secrets, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = SecretSerializer(data=request.data)
        if serializer.is_valid():
            # TODO: take user from session
            user = request.query_params.get("user")
            if user:
                user = get_object_or_404(User, id=user)
                serializer.save(owner=user)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SecretView(APIView):
    def put(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        request_user_id = request.query_params.get("user")
        if str(secret.owner.id) != str(request_user_id):  # TODO: take user from session
            return Response(status=status.HTTP_403_FORBIDDEN)
        serializer = SecretSerializer(secret, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def get(self, request, id):
        # Check if honeypot endpoint is enabled
        enabled = Setting.objects.filter(key="hidden_endpoint_enabled").first()
        if not enabled or enabled.value != "true":
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = get_request_user(request)
        if not user:
            # Return 404 to avoid revealing endpoint existence
            return Response(status=status.HTTP_404_NOT_FOUND)

        secret = get_object_or_404(Secret, id=id)
        
        # Log honeypot access if marked
        is_honeypot(secret, user, request)
        
        serializer = SecretSerializer(secret)
        return Response(serializer.data, status=status.HTTP_200_OK)
    


class SecretDeleteView(APIView):
    def delete(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        print(secret)
        request_user_id = request.query_params.get("user")
        if str(secret.owner.id) != str(request_user_id):  # TODO: take user from session
            return Response(status=status.HTTP_403_FORBIDDEN)
        secret.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShareSecretView(APIView):
    def post(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        secret_ciphertext = request.data.get("cipher_text")

        serializer = SharedSecretSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if str(secret.owner.id) != str(
            request.query_params.get("user")
        ):  # TODO: take user from session
            return Response(status=status.HTTP_403_FORBIDDEN)
        elif str(serializer.validated_data["sharing_with"].id) == str(secret.owner.id):
            return Response(
                {"detail": "You cannot share a secret with yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        elif not secret_ciphertext:
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
            print()
            shared.delete()
            return Response(
                {"detail": "Failed to store shared secret."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class SharedSecretView(APIView):
    def get(self, request, id):
        request_user = request.query_params.get("user")
        if not request_user:
            return Response(
                {"detail": "user query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shared = get_object_or_404(
            SharedSecret, id=id
        )
        SecretAccessLog.objects.create(
            secret=shared.secret,
            user_id=request_user,
            ip_address=request.META.get("X-Forwarded-For", request.META.get("REMOTE_ADDR", "")).split(",")[0].strip()
        )
        if str(request_user) != str(shared.sharing_with.id):
            return Response(status=status.HTTP_403_FORBIDDEN)

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
        request_user = request.query_params.get("user") # TODO: take user from session
        shared = get_object_or_404(SharedSecret, id=id)
        if str(request_user) != str(shared.secret.owner.id):
            return Response(status=status.HTTP_403_FORBIDDEN)
        shared.sharing_revoked = True
        shared.save()
        get_redis_client().delete(str(shared.id))
        return Response(status=status.HTTP_204_NO_CONTENT)

class MyOwnedSharedSecretsView(APIView): 
    def get(self, request):
        user_id = request.query_params.get("user") # TODO: take user from session
        if not user_id:
            return Response(
                {"detail": "user query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(User, id=user_id)
        if user.role != "tl":
            return Response(status=status.HTTP_403_FORBIDDEN)

        shared_queryset_1 = (
            SharedSecret.objects
            .filter(secret__owner=user, sharing_revoked=False, sharing_expires_at__gt=timezone.now())
            .select_related("secret", "sharing_with")
            .order_by("secret__label", "sharing_with__username")
        )
        shared_queryset_2 = (
            SharedSecret.objects
            .filter(secret__owner=user, sharing_revoked=False, sharing_expires_at__isnull=True)
            .select_related("secret", "sharing_with")
            .order_by("secret__label", "sharing_with__username")
        )
        serializer = OwnedSharedSecretSerializer(list(shared_queryset_1) + list(shared_queryset_2), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class MyReceivedSharedSecretsView(APIView):
    def get(self, request):
        user_id = request.query_params.get("user")  # TODO: take user from session
        if not user_id:
            return Response(
                {"detail": "user query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(User, id=user_id)
        shared_queryset = (
            SharedSecret.objects.filter(
                sharing_with=user,
                sharing_revoked=False,
            )
            .filter(Q(sharing_expires_at__isnull=True) | Q(sharing_expires_at__gt=timezone.now()))
            .order_by("secret__owner__username", "secret__label")
        )
        serializer = ReceivedSharedSecretSerializer(shared_queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
class HoneypotAccessLogsView(APIView):
    def get(self, request):
        request_user = get_request_user(request)
        if request_user is None:
            return Response(
                {"detail": "user query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request_user.role != "admin":
            return Response(status=status.HTTP_403_FORBIDDEN)

        access_logs = (
            HoneypotSecretAccessLog.objects.order_by("-timestamp")
        )
        serializer = SecretAccessLogSerializer(access_logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)