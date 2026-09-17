import { db } from "../lib/clients"

// [POST: /api/events flow-2 db:events:create] Stores the raw event
export async function saveEvent(input: { category: string; title: string }) {
  return db.event.create({ data: input })
}

// [POST: /api/events flow-4 case:coupon db:coupons:create] Issues an unassigned coupon for the event
export async function createCoupon(eventId: string) {
  return db.coupon.create({ data: { eventId, code: `CPN-${eventId.slice(-6).toUpperCase()}` } })
}
