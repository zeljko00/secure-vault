from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from django.core.exceptions import ValidationError
from django.conf import settings

from apps.users.models import Team, User, UserDeactivationLog, UserRole, RefreshToken
from apps.users.serializers import UserSerializer, TeamSerializer, DeactivationLogSerializer, RefreshTokenSerializer
from util.cryptography import sha256, CustomArgon2PasswordHasher
from util.authentication import create_access_token, create_refresh_token
from util.authorization import IsAdmin, IsTeamLead
from django.utils import timezone
from util.mfa import (
    build_totp_provisioning_uri,
    create_mfa_challenge,
    delete_mfa_challenge,
    encode_totp_secret,
    generate_totp_secret_bytes,
    get_mfa_challenge,
    verify_totp_code,
)

def user_info(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "teams": [{"id": team.id, "name": team.name} for team in user.teams.all()],
        "deactivated": DeactivationLogSerializer(UserDeactivationLog.objects.filter(user=user), many=True).data,
        "pub_key": user.pub_key,
        "join_timestamp": user.join_timestamp,
    }

def set_auth_cookies(response, access_token, refresh_token):
    """Set access and refresh tokens as HttpOnly, Secure, SameSite cookies."""
    from util.authentication import get_refresh_token_duration_minutes, get_access_token_duration_minutes
    
    # Calculate expiry times
    access_max_age = get_access_token_duration_minutes() * 60
    refresh_max_age = get_refresh_token_duration_minutes() * 60
    
    response.set_cookie(
        key='access_token',
        value=access_token,
        max_age=access_max_age,
        path='/',
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.SESSION_COOKIE_SAMESITE,
    )
    
    response.set_cookie(
        key='refresh_token',
        value=refresh_token,
        max_age=refresh_max_age,
        path='/',
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.SESSION_COOKIE_SAMESITE,
    )
    
    return response
    
def roles():
    return {role for role, role_capitalized in UserRole.choices}


def issue_user_session(user):
    refresh_token_payload = create_refresh_token()
    existing_token = RefreshToken.objects.filter(user=user).first()

    if existing_token:
        token_serializer = RefreshTokenSerializer(
            instance=existing_token,
            data=refresh_token_payload,
            partial=True,
        )
    else:
        token_serializer = RefreshTokenSerializer(data=refresh_token_payload)

    token_serializer.is_valid(raise_exception=True)

    if existing_token:
        token_serializer.save()
    else:
        token_serializer.save(user=user)

    access_token = create_access_token(user.id)
    refresh_token = refresh_token_payload.get("token")

    response = Response(
        {"user": user_info(user)},
        status=status.HTTP_200_OK,
    )
    return set_auth_cookies(response, access_token, refresh_token)

class UsersView(APIView):
    permission_classes = [AllowAny]

    # Specifies different permissions for different HTTP methods on same view
    def get_permissions(self):
        if self.request.method == "POST":
            return [AllowAny()]

        return [IsAuthenticated(), IsAdmin()]

    def post(self, request):
        serializer = UserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save(mfa_setup_pending=True)

        secret_bytes = generate_totp_secret_bytes()
        secret_base32 = encode_totp_secret(secret_bytes)
        challenge_id = create_mfa_challenge(
            {
                "type": "registration",
                "user_id": str(user.id),
                "secret_base32": secret_base32,
            }
        )

        provisioning_uri = build_totp_provisioning_uri(secret_bytes, user.username)
        response = Response(
            {
                "user": user_info(user),
                "mfa": {
                    "challenge_id": challenge_id,
                    "secret": secret_base32,
                    "provisioning_uri": provisioning_uri,
                    "issuer": "SecureVault",
                    "account_name": user.username,
                },
            },
            status=status.HTTP_201_CREATED,
        )
        return response

    def get(self, request):
        role = request.query_params.get("role")
        team = request.query_params.get("team")
        active = request.query_params.get("active")

        users = User.objects.all().prefetch_related("teams")

        if team:
            try:
                users = users.filter(teams__id=team)
            except ValidationError:
                users = []

        if role:
            if role not in roles():
                return Response(
                    {"role": "Invalid role."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            users = users.filter(role=role)
            
        if active:
            if active == "1":
                users = users.filter(deactivation_log__isnull=True)
            elif active == "0":
                users = users.filter(deactivation_log__isnull=False)

        return Response(
            [user_info(user) for user in users],
            status=status.HTTP_200_OK,
        )
        
class UserLoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        user = User.objects.filter(username=request.data.get("username")).first()
        if not user or UserDeactivationLog.objects.filter(user=user).exists(): 
            return Response(
                {"details": "Invalid username or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        else:
            custom_argon2_hasher = CustomArgon2PasswordHasher()
            try:
                custom_argon2_hasher.verify(request.data.get("password"), user.password_hash)
            except Exception:
                return Response(
                    {"details": "Invalid username or password."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

            if user.mfa_setup_pending:
                return Response(
                    {"detail": "MFA setup is not complete. Finish registration verification first."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if user.mfa_secret:
                challenge_id = create_mfa_challenge(
                    {
                        "type": "login",
                        "user_id": str(user.id),
                    }
                )

                return Response(
                    {
                        "mfa_required": True,
                        "challenge_id": challenge_id,
                    },
                    status=status.HTTP_200_OK,
                )

                return issue_user_session(user)
            else:
                return Response(
                    {"detail": "MFA setup is not complete. Finish registration verification first."},
                    status=status.HTTP_403_FORBIDDEN,
                )


class MFAVerifyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        challenge_id = str(request.data.get("challenge_id") or "").strip()
        code = str(request.data.get("code") or "").strip()
        if not challenge_id or not code:
            return Response(
                {"detail": "challenge_id and code are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        challenge = get_mfa_challenge(challenge_id)
        if not challenge:
            return Response(
                {"detail": "MFA challenge expired or not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        challenge_type = challenge.get("type")
        user_id = challenge.get("user_id")
        if not user_id:
            delete_mfa_challenge(challenge_id)
            return Response(
                {"detail": "Invalid MFA challenge."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(User, id=user_id)

        if challenge_type == "registration":
            secret_base32 = challenge.get("secret_base32")
            if not secret_base32:
                delete_mfa_challenge(challenge_id)
                return Response(
                    {"detail": "Invalid MFA challenge."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not verify_totp_code(secret_base32, code):
                return Response(
                    {"detail": "Invalid verification code."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user.mfa_secret = secret_base32
            user.mfa_setup_pending = False
            user.save(update_fields=["mfa_secret", "mfa_setup_pending"])
            delete_mfa_challenge(challenge_id)
            return issue_user_session(user)

        if challenge_type == "login":
            if not verify_totp_code(user.mfa_secret, code):
                return Response(
                    {"detail": "Invalid verification code."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            delete_mfa_challenge(challenge_id)
            return issue_user_session(user)

        delete_mfa_challenge(challenge_id)
        return Response(
            {"detail": "Invalid MFA challenge."},
            status=status.HTTP_400_BAD_REQUEST,
        )
class SessionRefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        # Try to get refresh token from cookies first, then from request body
        refresh_token = request.COOKIES.get("refresh_token") or request.data.get("refresh_token")
        
        if not refresh_token:
            return Response(
                {"details": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        token = RefreshToken.objects.filter(hash=sha256(refresh_token.encode())).filter(revoked=False).filter(expires_at__gt=timezone.now()).first()
        if not token:
            return Response(
                {"details": "Invalid or expired refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = token.user
        if UserDeactivationLog.objects.filter(user=user).exists():
            return Response(
                {"details": "User account is deactivated."},
                status=status.HTTP_403_FORBIDDEN,
            )
        
        access_token = create_access_token(user.id)
        
        response = Response(
            {"user": user_info(user)},
            status=status.HTTP_200_OK,
        )
        return set_auth_cookies(response, access_token, refresh_token)
class UserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = get_object_or_404(User, id=request.user.id)
        return Response(
            user_info(user),
            status=status.HTTP_200_OK,
        )


class UserLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Clear authentication cookies."""
        response = Response(status=status.HTTP_200_OK)
        response.delete_cookie('access_token', path='/')
        response.delete_cookie('refresh_token', path='/')
        return response


class UserRoleView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def put(self, request, id):
        user = get_object_or_404(User, id=id)
        role = request.data.get("role")

        allowed_roles = roles()
        if role not in allowed_roles:
            return Response(
                {"role": "Invalid role."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.role = role
        user.save(update_fields=["role"])

        return Response(
            user_info(user),
            status=status.HTTP_200_OK,
        )


class TeamsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        teams = Team.objects.all().order_by("name")

        return Response(
            [
                {
                    "id": team.id,
                    "name": team.name,
                    "description": team.description,
                }
                for team in teams
            ],
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = TeamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        team = serializer.save()

        return Response(
            {
                "id": team.id,
                "name": team.name,
                "description": team.description,
            },
            status=status.HTTP_201_CREATED,
        )


class TeamView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated(), IsTeamLead()]
        else:
            return [IsAuthenticated(), IsAdmin()]

    def delete(self, request, id):
        team = get_object_or_404(Team, id=id)
        team.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    def get(self, request, id):
        team = get_object_or_404(Team, id=id)
        self.check_object_permissions(request, team)

        users = User.objects.all().prefetch_related("teams")
        users = users.filter(teams__id=id)
        users = users.filter(deactivation_log__isnull=True)

        return Response(
            [user_info(user) for user in users],
            status=status.HTTP_200_OK,
        )
    
class UserTeamView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def put(self, request, id):
        user = get_object_or_404(User, id=id)
        team = request.data.get("team")
        if not team:
            return Response(
                {"team": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        team = get_object_or_404(Team, id=team)
        user.teams.add(team) # Implicitly persists to DB
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, id):
        user = get_object_or_404(User, id=id)
        team = request.data.get("team")
        if not team:
            return Response(
                {"team": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        team = get_object_or_404(Team, id=team)
        user.teams.remove(team) # Implicitly persists to DB
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserDeactivationView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def put(self, request, id):
        user = get_object_or_404(User, id=id)

        if UserDeactivationLog.objects.filter(user=user).exists():
            return Response(
                {"detail": "User is already deactivated."},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = DeactivationLogSerializer(data={**request.data, "user": user.id})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=user)
        RefreshToken.objects.filter(user=user).update(revoked=True)
        return Response(status=status.HTTP_204_NO_CONTENT)
    
class UserPasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        id = request.user.id
        password_old = request.data.get("old_password")
        password_new = request.data.get("new_password")
        if not id or not password_old or not password_new:
            return Response(
                {"details": "id, old_password and new_password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        else:
            user = get_object_or_404(User, id=id)
            custom_argon2_hasher = CustomArgon2PasswordHasher()
            
            try:
                custom_argon2_hasher.verify(password_old, user.password_hash,)
            except Exception:
                return Response(
                    {"details": "Old password is incorrect."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user.password_hash = custom_argon2_hasher.encode(password_new, salt=custom_argon2_hasher.salt())
            user.save(update_fields=["password_hash"])
            return Response(status=status.HTTP_204_NO_CONTENT)

class UserPublicKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        id = request.user.id
        pub_key = request.data.get("pub_key")
        if not id or not pub_key:
            return Response(
                {"details": "id and pub_key are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(User, id=id)
        user.pub_key = pub_key
        user.save(update_fields=["pub_key"])
        return Response(status=status.HTTP_204_NO_CONTENT)


