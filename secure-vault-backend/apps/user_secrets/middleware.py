from apps.user_secrets.models import AuditLog
from util.request import get_client_ip


class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        return self.process_response(request, response)

    def process_response(self, request, response):
        """Called after view executes"""
        
        # Views set audit on request._request (the underlying Django request)
        audit = getattr(request, 'audit', None)
        
        if audit:
            try:
                AuditLog.record_event(
                    action=request.method,
                    secret=audit.get("secret"),
                    is_shared_secret=audit.get("is_shared", False),
                    is_honeypot_secret=audit.get("is_honeypot", False),
                    user=audit.get("actor"),
                    ip_address=get_client_ip(request),
                    details=audit.get("details"),
                    payload=str(response.status_code),
                )
            except Exception as _:
                pass
        
        return response