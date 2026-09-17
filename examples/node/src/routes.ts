import { login, logout } from "./controllers/auth-controller"
import { postEvent } from "./controllers/event-controller"
import { cancelOrder, createOrder } from "./controllers/order-controller"
import { deleteUser, getUser, listUsers, updateUser } from "./controllers/user-controller"
import { stripeWebhook } from "./controllers/webhook-controller"
import type { Router } from "./http"

export function registerRoutes(router: Router) {
  router.post("/api/auth/login", login)
  router.post("/api/auth/logout", logout)

  router.get("/api/users", listUsers)
  router.get("/api/users/:id", getUser)
  router.patch("/api/users/:id", updateUser)
  router.delete("/api/users/:id", deleteUser)

  router.post("/api/orders", createOrder)
  router.post("/api/orders/:id/cancel", cancelOrder)

  router.post("/api/events", postEvent)
  router.post("/api/webhooks/stripe", stripeWebhook)
}
