import { HttpError } from "../lib/errors"
import { insertOrder } from "../repositories/order-repository"
import { findProductById } from "../repositories/product-repository"
import type { OrderInput } from "../validation/order"

// [POST: /api/orders flow-4] Prices the order against stock
export async function placeOrder(userId: string, { productId, quantity }: OrderInput) {
  const product = await findProductById(productId)
  // [POST: /api/orders flow-5 fail:404] Product does not exist
  if (!product) throw new HttpError(404, "product not found")
  // [POST: /api/orders flow-5 fail:409] Not enough stock
  if (product.stock < quantity) throw new HttpError(409, "out of stock")
  return insertOrder({ userId, productId, quantity, totalCents: product.priceCents * quantity })
}
