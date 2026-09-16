from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView
from apps.users.models import User, UserRole

permissions_lookup_table = {UserRole.ADMIN :['view_honeypot', 'is_admin'] , UserRole.TEAM_LEAD : ['view_secrets', 'add_secret', 'update_secret', 'delete_secret', 'share_secret', 'delete_shared_secret', 'view_shared_secret', 'view_sharing_secrets', 'view_received_secrets', 'view_team_members'], UserRole.DEVELOPER : ['view_secrets', 'add_secret', 'update_secret', 'delete_secret', 'view_shared_secret', 'view_received_secrets']}

class HasPermission(BasePermission):
    required_endpoint_permissions = {}

    def has_permission(self, request: Request, view: APIView):
        if (
            not request.user
            or not request.user.is_authenticated
            or not request.user.role
            or request.user.role not in permissions_lookup_table
            or request.method not in self.required_endpoint_permissions
        ):
            return False

        required_perms = self.required_endpoint_permissions[request.method]
        user_perms = permissions_lookup_table[request.user.role]
        return all(permission in user_perms for permission in required_perms)

class CanManageSecrets(HasPermission):
    required_endpoint_permissions = {'GET': ['view_secrets'],'POST': ['add_secret']}
    
class CanManageSecret(HasPermission):
    required_endpoint_permissions = {'PUT': ['update_secret'], 'DELETE': ['delete_secret']}
    
    def has_object_permission(self, request, view, obj):
        return request.user and request.user.is_authenticated and request.user.id == obj.owner.id
    
class CanManageSharedSecrets(HasPermission):
    required_endpoint_permissions = {'GET': ['view_sharing_secrets']}
    
class CanManageSharedSecret(HasPermission):
    required_endpoint_permissions = {'DELETE': ['delete_shared_secret'], 'GET': ['view_shared_secret'], 'POST': ['share_secret']}

    message = "You do not have permission to perform this action."

    def _shares_team_with_owner(self, owner, recipient) -> bool:
        owner_team_ids = set(owner.teams.values_list("id", flat=True))
        if not owner_team_ids:
            return False

        recipient_team_ids = set(recipient.teams.values_list("id", flat=True))
        return bool(owner_team_ids.intersection(recipient_team_ids))
    
    def has_object_permission(self, request, view, obj):
        if request.method == 'POST':
            if not request.user or not request.user.is_authenticated or request.user.id != obj.owner.id:
                return False

            recipient_id = request.data.get("sharing_with")
            if not recipient_id:
                return True

            recipient = User.objects.filter(id=recipient_id).first()
            if recipient is None:
                return True

            if recipient.id == obj.owner.id:
                self.message = "You cannot share a secret with yourself."
                return False

            if not self._shares_team_with_owner(obj.owner, recipient):
                self.message = "You can share a secret only with a user from the same team."
                return False

            return True

        if request.method == 'DELETE':
            return request.user and request.user.is_authenticated and request.user.id == obj.secret.owner.id

        if request.method == 'GET':
            return request.user and request.user.is_authenticated and request.user.id == obj.sharing_with.id

        return False
class CanManageReceivedSecrets(HasPermission):
    required_endpoint_permissions = {'GET': ['view_received_secrets']}
    
class IsAdmin(HasPermission):
    required_endpoint_permissions = {'GET': ['is_admin'], 'POST': ['is_admin'], 'PUT': ['is_admin'], 'DELETE': ['is_admin']}
    
class IsTeamLead(HasPermission):
    required_endpoint_permissions = {'GET': ['view_team_members']}
    
    def has_object_permission(self, request, view, obj):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.teams.filter(id=obj.id).exists()
        )