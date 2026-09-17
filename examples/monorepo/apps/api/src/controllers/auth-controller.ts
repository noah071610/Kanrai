import type { Next, Request, Response } from "../http"
import { authenticate } from "../services/auth-service"
import { parseLogin } from "../validation/auth"

// [POST: /api/auth/login flow-1] Signs a user in
export async function login(req: Request, res: Response, next: Next) {
  try {
    const input = parseLogin(req.body)
    const session = await authenticate(input)
    // [POST: /api/auth/login flow-7] Responds 200 with the access token
    res.status(200).json({ accessToken: session.accessToken })
  } catch (error) {
    next(error)
  }
}
