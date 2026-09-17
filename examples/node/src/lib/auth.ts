import type { Request } from "../http"
import { findSessionUser } from "../repositories/session-repository"
import { HttpError } from "./errors"

/** Resolves the caller from the Authorization header. Throws 401 when absent or expired. */
export async function requireUser(req: Request) {
  const token = req.headers.authorization?.replace(/^Bearer /, "")
  const session = token ? await findSessionUser(token) : null
  if (!session) {
    // [GET: /api/users flow-2 fail:401] Missing or expired access token
    // [PATCH: /api/users/:id flow-2 fail:401] Missing or expired access token
    // [DELETE: /api/users/:id flow-2 fail:401] Missing or expired access token
    // [POST: /api/orders flow-2 fail:401] Missing or expired access token
    // [POST: /api/orders/:id/cancel flow-2 fail:401] Missing or expired access token
    throw new HttpError(401, "unauthorized")
  }
  return session.user as { id: string; role: "customer" | "admin" }
}

export async function requireAdmin(req: Request) {
  const user = await requireUser(req)
  if (user.role !== "admin") {
    // [GET: /api/users flow-2 fail:403] Caller is not an admin
    // [DELETE: /api/users/:id flow-2 fail:403] Caller is not an admin
    throw new HttpError(403, "admin only")
  }
  return user
}
