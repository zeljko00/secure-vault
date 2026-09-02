from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.user_secrets.models import Secret, SharedSecret
from apps.user_secrets.serializers import SecretSerializer, SharedSecretSerializer
from apps.users.models import User


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
        if secret.owner != request.user:    # TODO: take user from session
            return Response(status=status.HTTP_403_FORBIDDEN)
        serializer = SecretSerializer(secret, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SecretDeleteView(APIView):
    def delete(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        if secret.owner != request.user:    # TODO: take user from session
            return Response(status=status.HTTP_403_FORBIDDEN)
        secret.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShareSecretView(APIView):
    def post(self, request, id):
        secret = get_object_or_404(Secret, id=id)
        if secret.owner != request.user:    # TODO: take user from session
            return Response(status=status.HTTP_403_FORBIDDEN)
        serializer = SharedSecretSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(secret=secret)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SharedSecretView(APIView):
    def get(self, request, id):
        shared = get_object_or_404(SharedSecret, id=id, sharing_with=request.user)
        serializer = SharedSecretSerializer(shared)
        return Response(serializer.data)

    def delete(self, request, id):
        shared = get_object_or_404(SharedSecret, id=id, secret__owner=request.user)
        shared.sharing_revoked = True
        shared.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
