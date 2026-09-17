from django.db import models
from django.db.models import Sum


class PaymentManager(models.Manager):
    # [POST: /api/webhooks/stripe flow-4 case:payment_intent.succeeded db:payments:update] Confirms the card payment by provider reference
    # [POST: /api/webhooks/stripe flow-4 case:charge.refunded db:payments:update] Marks the payment refunded by provider reference
    def set_status_by_provider_ref(self, provider_ref, status):
        self.filter(provider_ref=provider_ref).update(status=status)
        return self.get(provider_ref=provider_ref)


class PointLedgerManager(models.Manager):
    # [POST: /api/orders flow-8 case:points db:point_ledger:read] Sums the ledger into a balance
    def balance(self, user):
        return self.filter(user=user).aggregate(total=Sum("delta"))["total"] or 0
