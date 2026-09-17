import uuid

from django.db import models

from .managers import SessionManager, UserManager


class User(models.Model):
    class Role(models.TextChoices):
        CUSTOMER = "customer"
        ADMIN = "admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=128)
    display_name = models.CharField(max_length=80, null=True, blank=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.CUSTOMER)
    is_locked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    class Meta:
        db_table = "users"

    @property
    def is_authenticated(self):
        return True


class Session(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    access_token = models.CharField(max_length=64, unique=True)
    refresh_token = models.CharField(max_length=96, unique=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    objects = SessionManager()

    class Meta:
        db_table = "sessions"
        indexes = [models.Index(fields=["user"])]
