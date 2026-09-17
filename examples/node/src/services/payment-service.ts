import { mailgun, stripe } from "../lib/clients"
import { HttpError } from "../lib/errors"
import { insertPayment, setPaymentStatus } from "../repositories/payment-repository"
import { addPointEntry, getPointBalance } from "../repositories/point-repository"
import type { OrderInput } from "../validation/order"

interface OrderRef {
  id: string
  userId: string
  totalCents: number
  paymentMethod: OrderInput["paymentMethod"]
  payment?: { providerRef: string | null }
}

// [POST: /api/orders flow-7 branch] Charges according to the chosen payment method
export async function charge(order: OrderRef, input: OrderInput) {
  switch (input.paymentMethod) {
    case "card": {
      let intent
      try {
        // [POST: /api/orders flow-8 case:card api:stripe] Confirms a PaymentIntent with the card token
        intent = await stripe.paymentIntents.create({
          amount: order.totalCents,
          currency: "usd",
          payment_method: input.cardToken,
          confirm: true,
        })
      } catch {
        // [POST: /api/orders flow-8 case:card fail:402] Card declined
        throw new HttpError(402, "card declined")
      }
      return insertPayment(order.id, "card", order.totalCents, "succeeded", intent.id)
    }

    case "bank": {
      const payment = await insertPayment(order.id, "bank", order.totalCents, "pending", null)
      try {
        // [POST: /api/orders flow-9 case:bank api:mailgun] Emails the bank transfer instructions
        await mailgun.messages.create("example.com", { template: "bank-transfer", orderId: order.id })
      } catch {
        // [POST: /api/orders flow-9 case:bank fail:201] Mail failed; the order is still created as pending
      }
      return payment
    }

    case "points": {
      const balance = await getPointBalance(order.userId)
      // [POST: /api/orders flow-8 case:points fail:402] Not enough points
      if (balance < order.totalCents) throw new HttpError(402, "insufficient points")
      await addPointEntry(order.userId, -order.totalCents, "order", order.id)
      return insertPayment(order.id, "points", order.totalCents, "succeeded", null)
    }
  }
}

// [POST: /api/orders/:id/cancel flow-4 branch] Refunds according to how the order was paid
export async function refund(order: OrderRef) {
  switch (order.paymentMethod) {
    case "card":
      // [POST: /api/orders/:id/cancel flow-5 case:card api:stripe] Refunds the PaymentIntent
      await stripe.refunds.create({ payment_intent: order.payment?.providerRef })
      return setPaymentStatus(order.id, "refunded")

    case "bank":
      // Bank transfers are refunded by hand; only the status changes here.
      return setPaymentStatus(order.id, "refund_pending")

    case "points":
      await addPointEntry(order.userId, order.totalCents, "refund", order.id)
      return setPaymentStatus(order.id, "refunded")
  }
}
