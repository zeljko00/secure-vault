from rest_framework import serializers

from apps.users.models import RefreshToken, Team, User, UserDeactivationLog, UserRole

from util.cryptography import sha256, CustomArgon2PasswordHasher

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
        custom_argon2_hasher = CustomArgon2PasswordHasher()

        return User.objects.create(
            **validated_data,
            role=UserRole.DEVELOPER,
            password_hash=custom_argon2_hasher.encode(password, salt=custom_argon2_hasher.salt()),
        )

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        custom_argon2_hasher = CustomArgon2PasswordHasher()

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.password_hash = custom_argon2_hasher.encode(password, salt=custom_argon2_hasher.salt())

        instance.save()
        return instance

class DeactivationLogSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), write_only=True)

    class Meta:
        model = UserDeactivationLog
        fields = ["user", "timestamp", "reason"]
    
    def create(self, validated_data):
        return UserDeactivationLog.objects.create(**validated_data)


class RefreshTokenSerializer(serializers.ModelSerializer):
    token = serializers.CharField(write_only=True)
    user = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), write_only=True, required=False
    )

    class Meta:
        model = RefreshToken
        fields = ["user", "token", "created_at", "expires_at", "revoked"]

    def create(self, validated_data):
        token = validated_data.pop("token")
        return RefreshToken.objects.create(
            **validated_data,
            hash=sha256(token.encode()),
            revoked=validated_data.get("revoked", False),
        )

    def update(self, instance, validated_data):
        token = validated_data.pop("token", None)
        if token is not None:
            instance.hash = sha256(token.encode())

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if "revoked" not in validated_data:
            instance.revoked = False

        instance.save()
        return instance