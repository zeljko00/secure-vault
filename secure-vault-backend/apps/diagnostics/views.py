from django.shortcuts import render

# Create your views here.
from django.db import connection
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from util.redis_client import get_redis_client

class HealthAliveView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"}, status=status.HTTP_200_OK)

class HealthReadyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    
    def get(self, request):
        # Check redis and database connection here
        database_ok = False
        redis_ok = False
 
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            database_ok =  True
        except Exception:
            database_ok = False

        try:
            get_redis_client().ping()
            redis_ok = True
        except Exception:
            redis_ok = False

        database_status = "Database connection is OK." if database_ok else "Database connection is NOT OK"
        redis_status = "Redis connection is OK." if redis_ok else "Redis connection is NOT OK"

        return Response({"status": f'{database_status} {redis_status}'}, status=(status.HTTP_200_OK if (database_ok and redis_ok) else status.HTTP_503_SERVICE_UNAVAILABLE))

