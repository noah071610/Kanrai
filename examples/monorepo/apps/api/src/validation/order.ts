import { HttpError } from "../lib/errors"

export interface OrderInput {
  productId: string
  quantity: number
}

// [POST: /api/orders flow-3] Validates the product and quantity
export function parseOrder(body: any): OrderInput {
  if (typeof body?.productId !== "string" || !Number.isInteger(body?.quantity) || body.quantity < 1) {
    // [POST: /api/orders flow-3 fail:400] Body is invalid
    throw new HttpError(400, "invalid body")
  }
  return { productId: body.productId, quantity: body.quantity }
}
