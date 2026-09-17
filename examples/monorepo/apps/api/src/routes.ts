import { login } from "./controllers/auth-controller"
import { createOrder, listOrders } from "./controllers/order-controller"
import { getProduct, listProducts } from "./controllers/product-controller"
import { stripeWebhook } from "./controllers/webhook-controller"
import type { Router } from "./http"

export function registerRoutes(router: Router) {
  router.post("/api/auth/login", login)

  router.get("/api/products", listProducts)
  router.get("/api/products/:id", getProduct)

  router.get("/api/orders", listOrders)
  router.post("/api/orders", createOrder)

  // Called by Stripe, not by our apps: no flow-0 anywhere.
  router.post("/api/webhooks/stripe", stripeWebhook)
}
