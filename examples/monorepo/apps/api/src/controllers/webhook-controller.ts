import type { Next, Request, Response } from "../http"
import { markOrderPaid } from "../repositories/order-repository"

// [POST: /api/webhooks/stripe flow-1] Receives a Stripe payment event
export async function stripeWebhook(req: Request, res: Response, next: Next) {
  try {
    if (req.body?.type !== "payment_intent.succeeded") {
      // [POST: /api/webhooks/stripe flow-1 fail:200] Unhandled event type, ignored
      return res.status(200).json({ received: true })
    }
    await markOrderPaid(req.body.data.object.metadata.orderId)
    // [POST: /api/webhooks/stripe flow-3] Responds 200 to acknowledge
    res.status(200).json({ received: true })
  } catch (error) {
    next(error)
  }
}
