import { db } from "../lib/clients"

// [POST: /api/orders flow-5 db:orders:create] Inserts the order as pending with its total
export async function insertOrder(userId: string, paymentMethod: string, totalCents: number) {
  return db.order.create({ data: { userId, paymentMethod, totalCents, status: "pending" } })
}

// [POST: /api/orders flow-6 db:order_items:create] Inserts one row per cart item at the current price
export async function insertOrderItems(
  orderId: string,
  items: { productId: string; quantity: number }[],
  products: { id: string; priceCents: number }[],
) {
  return db.orderItem.createMany({
    data: items.map((item) => ({
      orderId,
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCents: products.find((p) => p.id === item.productId)!.priceCents,
    })),
  })
}

// [POST: /api/orders/:id/cancel flow-3 db:orders:read] Loads the order with its items and payment
export async function findOrderById(id: string) {
  return db.order.findUnique({ where: { id }, include: { items: true, payment: true } })
}

// [POST: /api/orders/:id/cancel flow-7 db:orders:update] Marks the order cancelled
// [POST: /api/webhooks/stripe flow-5 case:payment_intent.succeeded db:orders:update] Marks the order paid
export async function setOrderStatus(id: string, status: "paid" | "cancelled") {
  return db.order.update({
    where: { id },
    data: { status, ...(status === "cancelled" ? { cancelledAt: new Date() } : {}) },
  })
}
