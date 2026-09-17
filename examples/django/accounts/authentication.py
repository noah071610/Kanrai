from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import Session


class BearerAuthentication(BaseAuthentication):
    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        has_bearer = len(parts) == 2 and parts[0].lower() == b"bearer"
        session = Session.objects.live(parts[1].decode()) if has_bearer else None

        # [GET: /api/users/me flow-2 fail:401] Missing or expired access token
        # [PATCH: /api/users/me flow-2 fail:401] Missing or expired access token
        # [POST: /api/orders flow-2 fail:401] Missing or expired access token
        # [POST: /api/orders/:id/cancel flow-2 fail:401] Missing or expired access token
        if session is None:
            raise AuthenticationFailed("invalid or expired token")
        return (session.user, session)

    def authenticate_header(self, request):
        return "Bearer"
