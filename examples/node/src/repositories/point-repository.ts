import { db } from "../lib/clients"

// [POST: /api/orders flow-8 case:points db:point_ledger:read] Sums the ledger into a balance
export async function getPointBalance(userId: string): Promise<number> {
  const { _sum } = await db.pointLedger.aggregate({ where: { userId }, _sum: { delta: true } })
  return _sum?.delta ?? 0
}

// [POST: /api/orders flow-9 case:points db:point_ledger:create] Deducts the order total from the balance
// [POST: /api/orders/:id/cancel flow-5 case:points db:point_ledger:create] Gives the spent points back
export async function addPointEntry(userId: string, delta: number, reason: string, orderId: string) {
  return db.pointLedger.create({ data: { userId, delta, reason, orderId } })
}
