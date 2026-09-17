import { db } from "../lib/clients"

// [POST: /api/orders flow-4 db:products:read] Loads price and stock for every cart item
export async function findProducts(ids: string[]) {
  return db.product.findMany({ where: { id: { in: ids } } })
}

// [POST: /api/orders flow-11 db:products:update] Decrements stock for the ordered items
// [POST: /api/orders/:id/cancel flow-8 db:products:update] Puts the cancelled items back in stock
export async function adjustStock(items: { productId: string; quantity: number }[], sign: 1 | -1) {
  return db.$transaction(
    items.map((item) =>
      db.product.update({
        where: { id: item.productId },
        data: { stock: { increment: sign * item.quantity } },
      }),
    ),
  )
}
