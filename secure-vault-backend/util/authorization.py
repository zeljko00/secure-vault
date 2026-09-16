from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView
from apps.users.models import UserRole

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
    
    def has_object_permission(self, request, view, obj):
        if(request.method == 'DELETE' or request.method == 'POST'):
            return request.user and request.user.is_authenticated and request.user.id == obj.secret.owner.id
        elif(request.method == 'GET'):
            return request.user and request.user.is_authenticated and request.user.id == obj.sharing_with.id
        else:
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