import type { Request } from "../http"
import { findSessionUser } from "../repositories/session-repository"
import { HttpError } from "./errors"

// [GET: /api/orders flow-2] Requires a signed-in user
// [POST: /api/orders flow-2] Requires a signed-in user
export async function requireUser(req: Request) {
  const token = req.headers.authorization?.replace(/^Bearer /, "")
  const session = token ? await findSessionUser(token) : null
  if (!session) {
    // [GET: /api/orders flow-2 fail:401] Missing or expired access token
    // [POST: /api/orders flow-2 fail:401] Missing or expired access token
    throw new HttpError(401, "unauthorized")
  }
  return session.user
}
