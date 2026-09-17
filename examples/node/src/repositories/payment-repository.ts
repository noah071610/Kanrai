import { db } from "../lib/clients"

// [POST: /api/orders flow-9 case:card db:payments:create] Records the succeeded card payment
// [POST: /api/orders flow-8 case:bank db:payments:create] Records a pending bank payment
// [POST: /api/orders flow-10 case:points db:payments:create] Records the points payment
export async function insertPayment(
  orderId: string,
  method: string,
  amountCents: number,
  status: string,
  providerRef: string | null,
) {
  return db.payment.create({ data: { orderId, method, amountCents, status, providerRef } })
}

// [POST: /api/orders/:id/cancel flow-6 case:card db:payments:update] Marks the payment refunded
// [POST: /api/orders/:id/cancel flow-5 case:bank db:payments:update] Marks the payment for a manual refund
// [POST: /api/orders/:id/cancel flow-6 case:points db:payments:update] Marks the payment refunded
export async function setPaymentStatus(orderId: string, status: string) {
  return db.payment.update({ where: { orderId }, data: { status } })
}

// [POST: /api/webhooks/stripe flow-4 case:payment_intent.succeeded db:payments:update] Confirms the card payment by provider reference
// [POST: /api/webhooks/stripe flow-4 case:charge.refunded db:payments:update] Marks the payment refunded by provider reference
export async function setPaymentStatusByProviderRef(providerRef: string, status: string) {
  return db.payment.update({ where: { providerRef }, data: { status } })
}
