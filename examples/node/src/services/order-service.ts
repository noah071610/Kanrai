import { HttpError } from "../lib/errors"
import { findOrderById, insertOrder, insertOrderItems, setOrderStatus } from "../repositories/order-repository"
import { adjustStock, findProducts } from "../repositories/product-repository"
import type { OrderInput } from "../validation/order"
import { charge, refund } from "./payment-service"

export async function placeOrder(userId: string, input: OrderInput) {
  const products = await findProducts(input.items.map((i) => i.productId))

  for (const item of input.items) {
    const product = products.find((p: { id: string }) => p.id === item.productId)
    // [POST: /api/orders flow-4 fail:404] A cart item points at a product that does not exist
    if (!product) throw new HttpError(404, `product ${item.productId} not found`)
    // [POST: /api/orders flow-4 fail:409] Not enough stock for a cart item
    if (product.stock < item.quantity) throw new HttpError(409, `${product.sku} is out of stock`)
  }

  const totalCents = input.items.reduce((sum, item) => {
    const product = products.find((p: { id: string }) => p.id === item.productId)
    return sum + product.priceCents * item.quantity
  }, 0)

  const order = await insertOrder(userId, input.paymentMethod, totalCents)
  await insertOrderItems(order.id, input.items, products)
  const payment = await charge(order, input)
  await adjustStock(input.items, -1)

  return { ...order, payment }
}

export async function cancel(userId: string, orderId: string) {
  const order = await findOrderById(orderId)
  // [POST: /api/orders/:id/cancel flow-3 fail:404] Order does not exist or belongs to someone else
  if (!order || order.userId !== userId) throw new HttpError(404, "order not found")
  // [POST: /api/orders/:id/cancel flow-3 fail:409] Order already shipped or cancelled
  if (order.status === "shipped" || order.status === "cancelled") {
    throw new HttpError(409, `order is ${order.status}`)
  }

  await refund(order)
  const cancelled = await setOrderStatus(order.id, "cancelled")
  await adjustStock(order.items, +1)

  return cancelled
}
