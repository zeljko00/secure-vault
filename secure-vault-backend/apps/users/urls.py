from django.urls import path

from apps.users.views import (
    UsersView,
    TeamsView,
    UserView,
    UserPasswordView,
    UserPublicKeyView,
    UserRoleView,
    UserStatsView,
    UserTeamView,
    UserDeactivationView
)

urlpatterns = [
    path("", UsersView.as_view(), name="users"),
    path("teams/", TeamsView.as_view(), name="users-teams"),
    path("<uuid:id>/", UserView.as_view(), name="user"),
    path("<uuid:id>/role/", UserRoleView.as_view(), name="user-role"),
    path("<uuid:id>/team/", UserTeamView.as_view(), name="user-team"),
    path("<uuid:id>/stats/", UserStatsView.as_view(), name="user-stats"),
    path("<uuid:id>/deactivate/", UserDeactivationView.as_view(), name="user-deactivate"),
    path("me/password/", UserPasswordView.as_view(), name="user-password"),
    path("me/pub-key/", UserPublicKeyView.as_view(), name="user-public-key"),
]