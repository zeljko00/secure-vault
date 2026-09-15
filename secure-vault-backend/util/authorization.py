from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView
from apps.users.models import UserRole

permissions_lookup_table = {UserRole.ADMIN :['view_logs', 'view_honeypots', 'is_admin'] , UserRole.TEAM_LEAD : ['view_secrets', 'add_secret', 'update_secret', 'delete_secret', 'view_honeypots', 'share_secret', 'delete_shared_secret', 'view_shared_secret', 'view_sharing_secrets', 'view_received_secrets'], UserRole.DEVELOPER : ['view_secrets', 'add_secret', 'update_secret', 'delete_secret', 'view_honeypots', 'view_shared_secret', 'view_received_secrets']}

class HasPermission(BasePermission):
    required_permissions = [] 

    def has_permission(self, request: Request, view: APIView):
        if (
            not request.user
            or not request.user.is_authenticated
            or not request.user.role
            or request.user.role not in permissions_lookup_table
            or request.method not in self.required_permissions
        ):
            return False

        return all(permission in permissions_lookup_table[request.user.role] for permission in self.required_permissions[request.method])
        
        
class CanManageSecrets(HasPermission):
    required_permissions = {'GET': ['view_secrets'],'POST': ['add_secret']}
    
    
class CanManageLogs(HasPermission):
    required_permissions = {'GET': ['view_logs']}
    
class CanManageSecret(HasPermission):
    required_permissions = {'PUT': ['update_secret'],'GET': ['view_honeypots'], 'DELETE': ['delete_secret']}
    
class CanManageSharedSecrets(HasPermission):
    required_permissions = {'POST': ['share_secret'], 'GET': ['view_sharing_secrets']}
    
class CanManageSharedSecret(HasPermission):
    required_permissions = {'DELETE': ['delete_shared_secret'], 'GET': ['view_shared_secret']}
    
class CanManageReceivedSecrets(HasPermission):
    required_permissions = {'GET': ['view_received_secrets']}
    
class IsAdmin(HasPermission):
    required_permissions = {'GET': ['is_admin'], 'POST': ['is_admin'], 'PUT': ['is_admin'], 'DELETE': ['is_admin']}