from django.contrib.auth.hashers import check_password
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from .models import Session, User


def login(email, password):
    user = User.objects.by_email(email)

    # [POST: /api/auth/login flow-3 fail:401] Unknown email or wrong password
    if user is None or not check_password(password, user.password_hash):
        raise AuthenticationFailed("invalid credentials")
    # [POST: /api/auth/login flow-3 fail:403] Account is locked
    if user.is_locked:
        raise PermissionDenied("account locked")

    return Session.objects.open(user)
