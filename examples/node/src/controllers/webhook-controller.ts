import type { Next, Request, Response } from "../http"
import { stripe } from "../lib/clients"
import { setOrderStatus } from "../repositories/order-repository"
import { setPaymentStatusByProviderRef } from "../repositories/payment-repository"

// [POST: /api/webhooks/stripe flow-1] Receives a Stripe webhook
export async function stripeWebhook(req: Request, res: Response, next: Next) {
  try {
    let event
    try {
      // [POST: /api/webhooks/stripe flow-2] Verifies the Stripe signature locally
      event = stripe.webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"], "whsec_example")
    } catch {
      // [POST: /api/webhooks/stripe flow-2 fail:400] Signature does not match
      return res.status(400).json({ error: "invalid signature" })
    }

    // [POST: /api/webhooks/stripe flow-3 branch] Dispatches on the event type
    switch (event.type) {
      case "payment_intent.succeeded": {
        const payment = await setPaymentStatusByProviderRef(event.data.object.id, "succeeded")
        await setOrderStatus(payment.orderId, "paid")
        break
      }
      case "charge.refunded":
        await setPaymentStatusByProviderRef(event.data.object.payment_intent, "refunded")
        break
      default:
        // [POST: /api/webhooks/stripe flow-4 case:other fail:200] Unhandled event type, acknowledged so Stripe stops retrying
        break
    }

    // [POST: /api/webhooks/stripe flow-6] Acknowledges receipt
    res.status(200).json({ received: true })
  } catch (error) {
    next(error)
  }
}
