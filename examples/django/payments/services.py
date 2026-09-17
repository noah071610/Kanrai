import requests

from common.clients import send_template, stripe
from common.exceptions import PaymentRequired

from .models import Payment, PointLedger


# [POST: /api/orders flow-7 branch] Charges according to the chosen payment method
def charge(order, card_token=None):
    match order.payment_method:
        case "card":
            try:
                # [POST: /api/orders flow-8 case:card api:stripe] Confirms a PaymentIntent with the card token
                intent = stripe.PaymentIntent.create(
                    amount=order.total_cents,
                    currency="usd",
                    payment_method=card_token,
                    confirm=True,
                )
            except stripe.error.CardError:
                # [POST: /api/orders flow-8 case:card fail:402] Card declined
                raise PaymentRequired("card declined") from None

            # [POST: /api/orders flow-9 case:card db:payments:create] Records the succeeded card payment
            return Payment.objects.create(
                order=order,
                method="card",
                status=Payment.Status.SUCCEEDED,
                amount_cents=order.total_cents,
                provider_ref=intent.id,
            )

        case "bank":
            # [POST: /api/orders flow-8 case:bank db:payments:create] Records a pending bank payment
            payment = Payment.objects.create(order=order, method="bank", amount_cents=order.total_cents)
            try:
                # [POST: /api/orders flow-9 case:bank api:mailgun] Emails the bank transfer instructions
                send_template("bank-transfer", order.user.email, {"order_id": str(order.id)})
            except requests.RequestException:
                # [POST: /api/orders flow-9 case:bank fail:201] Mail failed; the order is still created as pending
                pass
            return payment

        case "points":
            balance = PointLedger.objects.balance(order.user)
            # [POST: /api/orders flow-8 case:points fail:402] Not enough points
            if balance < order.total_cents:
                raise PaymentRequired("insufficient points")

            # [POST: /api/orders flow-9 case:points db:point_ledger:create] Deducts the order total from the balance
            PointLedger.objects.create(user=order.user, delta=-order.total_cents, reason="order", order=order)

            # [POST: /api/orders flow-10 case:points db:payments:create] Records the points payment
            return Payment.objects.create(
                order=order,
                method="points",
                status=Payment.Status.SUCCEEDED,
                amount_cents=order.total_cents,
            )


# [POST: /api/orders/:id/cancel flow-4 branch] Refunds according to how the order was paid
def refund(order):
    payments = Payment.objects.filter(order=order)

    match order.payment_method:
        case "card":
            # [POST: /api/orders/:id/cancel flow-5 case:card api:stripe] Refunds the PaymentIntent
            stripe.Refund.create(payment_intent=order.payment.provider_ref)
            # [POST: /api/orders/:id/cancel flow-6 case:card db:payments:update] Marks the payment refunded
            payments.update(status=Payment.Status.REFUNDED)

        case "bank":
            # [POST: /api/orders/:id/cancel flow-5 case:bank db:payments:update] Bank transfers are refunded by hand; marks the payment refund_pending
            payments.update(status=Payment.Status.REFUND_PENDING)

        case "points":
            # [POST: /api/orders/:id/cancel flow-5 case:points db:point_ledger:create] Gives the points back
            PointLedger.objects.create(user=order.user, delta=order.total_cents, reason="refund", order=order)
            # [POST: /api/orders/:id/cancel flow-6 case:points db:payments:update] Marks the payment refunded
            payments.update(status=Payment.Status.REFUNDED)
