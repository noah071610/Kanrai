import { db } from "../lib/prisma"

// [GET: /api/orders flow-4 case:admin db:orders:read] Loads every order
export const findAllOrders = () => db.order.findMany({ orderBy: { createdAt: "desc" } })

// [GET: /api/orders flow-4 case:customer db:orders:read] Loads the caller's orders
export const findOrdersByUser = (userId: string) =>
  db.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })

// [POST: /api/orders flow-6 db:orders:create] Inserts the order
export const insertOrder = (data: { userId: string; productId: string; quantity: number; totalCents: number }) =>
  db.order.create({ data })

// [POST: /api/webhooks/stripe flow-2 db:orders:update] Marks the order as paid
export const markOrderPaid = (id: string) => db.order.update({ where: { id }, data: { paidAt: new Date() } })
