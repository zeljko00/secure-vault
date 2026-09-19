from django.urls import path

from apps.diagnostics.views import (
    HealthAliveView,
    HealthReadyView
)

urlpatterns = [
    path("health/alive/", HealthAliveView.as_view(), name="health-alive"),
    path("health/ready/", HealthReadyView.as_view(), name="health-ready"),
]