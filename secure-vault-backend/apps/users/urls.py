from django.urls import path

from apps.users.views import (
    UsersView,
    UserLoginView,
    TeamsView,
    TeamView,
    UserView,
    UserPasswordView,
    UserPublicKeyView,
    UserRoleView,
    UserTeamView,
    UserDeactivationView
)

urlpatterns = [
    path("", UsersView.as_view(), name="users"),
    path("login/", UserLoginView.as_view(), name="user-login"),
    path("teams/", TeamsView.as_view(), name="users-teams"),
    path("teams/<uuid:id>/", TeamView.as_view(), name="users-team"),
    path("<uuid:id>/role/", UserRoleView.as_view(), name="user-role"),
    path("<uuid:id>/team/", UserTeamView.as_view(), name="user-team"),
    path("<uuid:id>/deactivate/", UserDeactivationView.as_view(), name="user-deactivate"),
    path("me/", UserView.as_view(), name="user"),
    path("me/password/", UserPasswordView.as_view(), name="user-password"),
    path("me/pub-key/", UserPublicKeyView.as_view(), name="user-public-key"),
]