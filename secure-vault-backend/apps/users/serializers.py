from rest_framework import serializers

from apps.users.models import User, UserRole


class CreateUserSerializer(serializers.ModelSerializer):
    # field-level validation of input data
    password = serializers.CharField(write_only=True, min_length=12)

    class Meta:
        # validate against the User model
        model = User
        # specify the User model fields to be serialized and deserialized
        fields = ["username", "email", "password", "pub_key"]

    def create(self, validated_data):
        password = validated_data.pop("password")

        return User.objects.create(
            **validated_data,
            role=UserRole.GUEST,
            password_hash=password,
        )
