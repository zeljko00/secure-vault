from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from apps.settings.models import Setting
from util.authorization import IsAdmin


PUBLIC_SETTING_KEYS = {
    "user_password_min_length",
    "master_password_length",
    "master_password_min_length",
}

class SettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
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
    permission_classes = [IsAuthenticated, IsAdmin]
        
    def put(self, request, key):
        value = request.data.get("value")
        if value is None:
            return Response(
                {"value": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only update existing keys, reject creation of new keys
        setting = Setting.objects.filter(key=key).first()
        if not setting:
            return Response(
                {"detail": "Setting key not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        
        setting.value = str(value)
        setting.save()
        return Response({setting.key: setting.value}, status=status.HTTP_200_OK)