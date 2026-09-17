from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.clients import stripe
from orders.models import Order

from .models import Payment


class StripeWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    # [POST: /api/webhooks/stripe flow-1] Receives a Stripe webhook
    def post(self, request):
        try:
            # [POST: /api/webhooks/stripe flow-2] Verifies the Stripe signature locally
            event = stripe.Webhook.construct_event(
                request.body,
                request.headers.get("Stripe-Signature", ""),
                settings.STRIPE_WEBHOOK_SECRET,
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            # [POST: /api/webhooks/stripe flow-2 fail:400] Signature does not match
            return Response({"error": "invalid signature"}, status=400)

        obj = event["data"]["object"]

        # [POST: /api/webhooks/stripe flow-3 branch] Dispatches on the event type
        match event["type"]:
            case "payment_intent.succeeded":
                payment = Payment.objects.set_status_by_provider_ref(obj["id"], Payment.Status.SUCCEEDED)
                # [POST: /api/webhooks/stripe flow-5 case:payment_intent.succeeded db:orders:update] Marks the order paid
                Order.objects.filter(pk=payment.order_id).update(status=Order.Status.PAID)

            case "charge.refunded":
                Payment.objects.set_status_by_provider_ref(obj["payment_intent"], Payment.Status.REFUNDED)

            case _:
                # [POST: /api/webhooks/stripe flow-4 case:other fail:200] Unhandled event type, acknowledged so Stripe stops retrying
                pass

        # [POST: /api/webhooks/stripe flow-6] Acknowledges receipt
        return Response({"received": True})
