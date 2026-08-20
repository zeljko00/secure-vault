from rest_framework import serializers

from apps.user_secrets.models import Secret

class SecretSerializer(serializers.ModelSerializer):
    class Meta:
        model = Secret
        fields = ["id", "type", "label", "value", "marker", "owner"]
        read_only_fields = ["id", "owner"]