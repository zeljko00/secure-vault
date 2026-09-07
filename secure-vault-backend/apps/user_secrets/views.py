import json

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from redis.exceptions import RedisError

from apps.user_secrets.models import Secret, SharedSecret
from apps.user_secrets.serializers import (
    SecretSerializer,
    SharedSecretSerializer,
)
from apps.users.models import User
from util.redis_client import get_redis_client


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


class SecretUpdateView(APIView):
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
    def get(self, request, shared_secret_id):
        request_user = request.query_params.get("user")
        shared = get_object_or_404(
            SharedSecret, id=shared_secret_id
        )
        if shared.sharing_revoked:
            return Response(status=status.HTTP_404_NOT_FOUND)

        redis_client = get_redis_client()
        payload = redis_client.get(str(shared.id))
        if not payload:
            return Response(
                {"detail": "Shared secret expired or unavailable."},
                status=status.HTTP_410_GONE,
            )

        return Response(shared, status=status.HTTP_200_OK)

    def delete(self, request, shared_secret_id):
        request_user = request.query_params.get("user") # TODO: take user from session
        shared = get_object_or_404(
            SharedSecret, id=shared_secret_id)
        if str(request_user) != str(shared.sharing_with.id):
            return Response(status=status.HTTP_403_FORBIDDEN)
        shared.sharing_revoked = True
        shared.save()
        get_redis_client().delete(str(shared.id))
        return Response(status=status.HTTP_204_NO_CONTENT)
