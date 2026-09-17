import type { Next, Request, Response } from "../http"
import { requireUser } from "../lib/auth"
import { cancel, placeOrder } from "../services/order-service"
import { parseOrder } from "../validation/order"

// [POST: /api/orders flow-1] Checkout: turns a cart into a paid (or pending) order
export async function createOrder(req: Request, res: Response, next: Next) {
  try {
    const user = await requireUser(req)
    const input = parseOrder(req.body)
    const order = await placeOrder(user.id, input)

    // [POST: /api/orders flow-12] Answers 201 with the order and its payment status
    res.status(201).json(order)
  } catch (error) {
    next(error)
  }
}

// [POST: /api/orders/:id/cancel flow-1] Cancels an order that has not shipped
export async function cancelOrder(req: Request, res: Response, next: Next) {
  try {
    const user = await requireUser(req)
    const order = await cancel(user.id, req.params.id)

    // [POST: /api/orders/:id/cancel flow-9] Returns the cancelled order
    res.status(200).json(order)
  } catch (error) {
    next(error)
  }
}
