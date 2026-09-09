from rest_framework import serializers

from apps.user_secrets.models import Secret, SharedSecret, SecretAccessLog
from django.utils import timezone

class SecretValueField(serializers.Field):
    def to_representation(self, value):
        if value is None:
            return None
        if isinstance(value, memoryview):
            value = value.tobytes()
        if isinstance(value, (bytes, bytearray)):
            return bytes(value).decode("utf-8")
        return str(value)

    def to_internal_value(self, data):
        if not isinstance(data, str):
            raise serializers.ValidationError("Secret value must be a string.")
        return data.encode("utf-8")


class SecretSerializer(serializers.ModelSerializer):
    value = SecretValueField()

    class Meta:
        model = Secret
        fields = ["id", "type", "label", "value", "marker","iv", "owner"]
        read_only_fields = ["id", "owner"]


class SharedSecretSerializer(serializers.ModelSerializer):
    class Meta:
        model = SharedSecret
        fields = ["id", "secret", "sharing_with", "sharing_expires_at", "sharing_revoked"]
        read_only_fields = ["id", "secret", "sharing_revoked"]

    def validate_sharing_expires_at(self, value):
        if value is not None and value <= timezone.now():
            raise serializers.ValidationError("sharing_expires_at must be in the future.")
        return value


class OwnedSharedSecretSerializer(serializers.ModelSerializer):
    secret_id = serializers.UUIDField(source="secret.id", read_only=True)
    secret_label = serializers.CharField(source="secret.label", read_only=True)
    secret_type = serializers.CharField(source="secret.type", read_only=True)
    sharing_with_id = serializers.UUIDField(source="sharing_with.id", read_only=True)
    sharing_with_username = serializers.CharField(source="sharing_with.username", read_only=True)

    class Meta:
        model = SharedSecret
        fields = [
            "id",
            "secret_id",
            "secret_label",
            "secret_type",
            "sharing_with_id",
            "sharing_with_username",
            "sharing_expires_at",
            "sharing_revoked",
        ]


class ReceivedSharedSecretSerializer(serializers.ModelSerializer):
    secret_id = serializers.UUIDField(source="secret.id", read_only=True)
    secret_label = serializers.CharField(source="secret.label", read_only=True)
    secret_type = serializers.CharField(source="secret.type", read_only=True)
    owner_id = serializers.UUIDField(source="secret.owner.id", read_only=True)
    owner_username = serializers.CharField(source="secret.owner.username", read_only=True)

    class Meta:
        model = SharedSecret
        fields = [
            "id",
            "secret_id",
            "secret_label",
            "secret_type",
            "owner_id",
            "owner_username",
            "sharing_expires_at",
            "sharing_revoked",
        ]
        
class SecretAccessLogSerializer(serializers.ModelSerializer):
    secret_id = serializers.UUIDField(source="secret.id", read_only=True)
    secret_label = serializers.CharField(source="secret.label", read_only=True)
    accessed_by_id = serializers.UUIDField(source="user.id", read_only=True)
    accessed_by_username = serializers.CharField(source="user.username", read_only=True)
    
    class Meta:
        model = SecretAccessLog
        fields = [
            "id",
            "secret_id",
            "secret_label",
            "accessed_by_id",
            "accessed_by_username",
            "timestamp",
            "ip_address",
            "details",
        ]
