from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import LoginSerializer, UserSerializer


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    # [POST: /api/auth/login flow-1] Entry point; reads email and password
    def post(self, request):
        # [POST: /api/auth/login flow-2] Validates the email and password shape
        serializer = LoginSerializer(data=request.data)
        # [POST: /api/auth/login flow-2 fail:400] Body fails validation
        serializer.is_valid(raise_exception=True)

        session = services.login(**serializer.validated_data)

        # [POST: /api/auth/login flow-5] Answers 200 with the token pair
        return Response(
            {
                "access_token": session.access_token,
                "refresh_token": session.refresh_token,
                "expires_at": session.expires_at,
            }
        )


class MeView(APIView):
    # [GET: /api/users/me flow-1] Returns the signed-in user's profile
    def get(self, request):
        # [GET: /api/users/me flow-3] Answers 200 with the profile
        return Response(UserSerializer(request.user).data)

    # [PATCH: /api/users/me flow-1] Updates the signed-in user's display name
    def patch(self, request):
        # [PATCH: /api/users/me flow-3] Validates the profile fields
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        # [PATCH: /api/users/me flow-3 fail:400] Display name is too long
        serializer.is_valid(raise_exception=True)

        # [PATCH: /api/users/me flow-4 db:users:update] Saves the new display name
        serializer.save()

        # [PATCH: /api/users/me flow-5] Answers 200 with the updated profile
        return Response(serializer.data)
