import secrets
from datetime import timedelta

from django.db import models
from django.utils import timezone

ACCESS_TTL = timedelta(minutes=15)


class UserManager(models.Manager):
    # [POST: /api/auth/login flow-3 db:users:read] Looks the user up by email
    def by_email(self, email):
        return self.filter(email__iexact=email).first()


class SessionManager(models.Manager):
    # [POST: /api/auth/login flow-4 db:sessions:create] Stores a session with a fresh access and refresh token
    def open(self, user):
        return self.create(
            user=user,
            access_token=secrets.token_urlsafe(32),
            refresh_token=secrets.token_urlsafe(48),
            expires_at=timezone.now() + ACCESS_TTL,
        )

    # [GET: /api/users/me flow-2 db:sessions:read] Resolves the bearer token to a live session and user
    # [PATCH: /api/users/me flow-2 db:sessions:read] Resolves the bearer token to a live session and user
    # [POST: /api/orders flow-2 db:sessions:read] Resolves the bearer token to a live session and user
    # [POST: /api/orders/:id/cancel flow-2 db:sessions:read] Resolves the bearer token to a live session and user
    def live(self, access_token):
        return (
            self.select_related("user")
            .filter(access_token=access_token, expires_at__gt=timezone.now())
            .first()
        )
