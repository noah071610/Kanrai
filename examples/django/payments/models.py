import uuid

from django.db import models

from .managers import PaymentManager, PointLedgerManager


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        SUCCEEDED = "succeeded"
        FAILED = "failed"
        REFUNDED = "refunded"
        REFUND_PENDING = "refund_pending"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.OneToOneField("orders.Order", on_delete=models.CASCADE, related_name="payment")
    method = models.CharField(max_length=16)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    amount_cents = models.PositiveIntegerField()
    provider_ref = models.CharField(max_length=64, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = PaymentManager()

    class Meta:
        db_table = "payments"


class PointLedger(models.Model):
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="point_entries")
    delta = models.IntegerField()
    reason = models.CharField(max_length=32)
    order = models.ForeignKey("orders.Order", on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = PointLedgerManager()

    class Meta:
        db_table = "point_ledger"
        unique_together = [("order", "reason")]
