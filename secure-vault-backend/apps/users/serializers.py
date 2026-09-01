from rest_framework import serializers

from apps.users.models import Team, User, UserDeactivationLog, UserRole

from util.cryptography import sha256
class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ["name", "description"]

    def create(self, validated_data):
        return Team.objects.create(**validated_data)

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class UserSerializer(serializers.ModelSerializer):
    # field-level validation of input data
    password = serializers.CharField(write_only=True)

    class Meta:
        # validate against the User model
        model = User
        # specify the User model fields to be serialized and deserialized
        fields = ["username", "email", "password", "pub_key"]

    def create(self, validated_data):
        password = validated_data.pop("password")

        return User.objects.create(
            **validated_data,
            role=UserRole.DEVELOPER,
            password_hash=sha256(password.encode()),
        )

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.password_hash = sha256(password.encode())

        instance.save()
        return instance

class DeactivationLogSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), write_only=True)
    class Meta:
        model = UserDeactivationLog
        fields = ["user", "timestamp", "reason"]
    
    def create(self, validated_data):
        return UserDeactivationLog.objects.create(**validated_data)
    