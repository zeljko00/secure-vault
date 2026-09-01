from rest_framework import serializers

from apps.user_secrets.models import Secret, SharedSecret


class SecretSerializer(serializers.ModelSerializer):
    class Meta:
        model = Secret
        fields = ["id", "type", "label", "value", "marker", "owner"]
        read_only_fields = ["id", "owner"]


class SharedSecretSerializer(serializers.ModelSerializer):
    class Meta:
        model = SharedSecret
        fields = ["id", "secret", "sharing_with", "sharing_expires_at", "sharing_revoked", "sharing_content_id"]
        read_only_fields = ["id", "secret", "sharing_revoked"]