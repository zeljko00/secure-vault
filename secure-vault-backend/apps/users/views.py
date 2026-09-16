from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from django.core.exceptions import ValidationError

from apps.users.models import Team, User, UserDeactivationLog, UserRole
from apps.users.serializers import UserSerializer, TeamSerializer, DeactivationLogSerializer
from util.cryptography import sha256
from util.authentication import create_access_token
from util.authorization import IsAdmin, IsTeamLead

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
    
def roles():
    return {role for role, role_capitalized in UserRole.choices}

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
        user = serializer.save()
        return Response(
            {
                "user": user_info(user),
                "access_token": create_access_token(user),
            },
            status=status.HTTP_201_CREATED,
        )

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
    permission_classes = [AllowAny]

    def post(self, request):
        user = User.objects.filter(username=request.data.get("username")).first()
        if not user or user.password_hash != sha256(request.data.get("password").encode()) or UserDeactivationLog.objects.filter(user=user).exists(): 
            return Response(
                {"details": "Invalid username or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        else:
            return Response(
                {
                    "user": user_info(user),
                    "access_token": create_access_token(user),
                },
                status=status.HTTP_200_OK,
            )

class UserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = get_object_or_404(User, id=request.user.id)
        return Response(
            user_info(user),
            status=status.HTTP_200_OK,
        )


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

        if not UserDeactivationLog.objects.filter(user=user).exists():
            return Response(
                {"detail": "User is already deactivated."},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = DeactivationLogSerializer(data={**request.data, "user": user.id})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=user)
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
            if user.password_hash != sha256(password_old.encode()):
                return Response(
                    {"details": "Old password is incorrect."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            else:
                user.password_hash = sha256(password_new.encode())
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


