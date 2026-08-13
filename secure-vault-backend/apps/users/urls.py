from django.urls import path

from apps.users.views import CreateUserView

urlpatterns = [
    # URL extension added to users app base URL
    path("signup/", CreateUserView.as_view(), name="user-signup"),
]