from django.db import models


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True


class User(TimeStamped):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        USER = "user", "User"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=Role.choices, null=True)
    nickname = models.CharField(max_length=30, db_column="nick")


class Staff(User):
    badge = models.CharField(max_length=10)


class UserProxy(User):
    class Meta:
        proxy = True
