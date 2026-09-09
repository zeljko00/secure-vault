from django.urls import path

from apps.settings.views import (
    PublicSettingsView,
    SettingsView,
    SettingView
)

urlpatterns = [
    path("public/", PublicSettingsView.as_view(), name="public-settings"),
    path("", SettingsView.as_view(), name="settings"),
    path("<str:key>/", SettingView.as_view(), name="setting"),
]