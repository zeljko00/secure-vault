from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from apps.settings.models import Setting
from apps.users.models import User, UserRole


PUBLIC_SETTING_KEYS = {
    "user_password_min_length",
    "master_password_length",
    "master_password_min_length",
}


def require_admin_user(request):
    user_id = request.query_params.get("user")
    if not user_id:
        return None, Response(
            {"detail": "user query parameter is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.filter(id=user_id).first()
    if not user or user.role != UserRole.ADMIN:
        return None, Response(status=status.HTTP_403_FORBIDDEN)

    return user, None

class SettingsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        _, error_response = require_admin_user(request)
        if error_response:
            return error_response

        settings = Setting.objects.all().order_by("key")
        settings_dict = {setting.key: setting.value for setting in settings}
        return Response(settings_dict, status=status.HTTP_200_OK)


class PublicSettingsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        settings = Setting.objects.filter(key__in=PUBLIC_SETTING_KEYS).order_by("key")
        settings_dict = {setting.key: setting.value for setting in settings}
        return Response(settings_dict, status=status.HTTP_200_OK)
    

class SettingView(APIView):
    permission_classes = [AllowAny]
        
    def put(self, request, key):
        _, error_response = require_admin_user(request)
        if error_response:
            return error_response

        value = request.data.get("value")
        if value is None:
            return Response(
                {"value": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        setting, _ = Setting.objects.update_or_create(
            key=key,
            defaults={"value": str(value)},
        )
        return Response({setting.key: setting.value}, status=status.HTTP_200_OK)