import type { Next, Request, Response } from "../http"
import { requireUser } from "../lib/auth"
import { findAllOrders, findOrdersByUser } from "../repositories/order-repository"
import { placeOrder } from "../services/order-service"
import { parseOrder } from "../validation/order"

// [GET: /api/orders flow-1] Lists orders for the caller
export async function listOrders(req: Request, res: Response, next: Next) {
  try {
    const user = await requireUser(req)
    // [GET: /api/orders flow-3 branch] Scopes by role
    const orders =
      user.role === "admin"
        ? await findAllOrders()
        : await findOrdersByUser(user.id)
    // [GET: /api/orders flow-5] Responds 200 with the orders
    res.status(200).json(orders)
  } catch (error) {
    next(error)
  }
}

// [POST: /api/orders flow-1] Places an order
export async function createOrder(req: Request, res: Response, next: Next) {
  try {
    const user = await requireUser(req)
    const input = parseOrder(req.body)
    const order = await placeOrder(user.id, input)
    // [POST: /api/orders flow-7] Responds 201 with the order
    res.status(201).json(order)
  } catch (error) {
    next(error)
  }
}
