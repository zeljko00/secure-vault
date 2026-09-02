from rest_framework import serializers

from apps.user_secrets.models import Secret, SharedSecret


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
        fields = ["id", "secret", "sharing_with", "sharing_expires_at", "sharing_revoked", "sharing_content_id"]
        read_only_fields = ["id", "secret", "sharing_revoked"]