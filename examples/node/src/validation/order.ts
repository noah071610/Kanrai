import { HttpError } from "../lib/errors"

export type PaymentMethod = "card" | "bank" | "points"

export interface OrderInput {
  items: { productId: string; quantity: number }[]
  paymentMethod: PaymentMethod
  cardToken?: string
}

// [POST: /api/orders flow-3] Validates cart items and the payment method
export function parseOrder(body: unknown): OrderInput {
  const input = (body ?? {}) as OrderInput
  const validItems =
    Array.isArray(input.items) &&
    input.items.length > 0 &&
    input.items.every((i) => Number.isInteger(i.quantity) && i.quantity > 0)
  if (!validItems || !["card", "bank", "points"].includes(input.paymentMethod)) {
    // [POST: /api/orders flow-3 fail:400] Empty cart, bad quantity or unknown payment method
    throw new HttpError(400, "invalid order")
  }
  if (input.paymentMethod === "card" && !input.cardToken) {
    // [POST: /api/orders flow-3 fail:400] Card payment without a card token
    throw new HttpError(400, "cardToken is required for card payments")
  }
  return input
}
