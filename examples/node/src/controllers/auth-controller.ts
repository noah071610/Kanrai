import type { Next, Request, Response } from "../http"
import { authenticate } from "../services/auth-service"
import { revokeSession } from "../services/token-service"
import { parseLogin } from "../validation/auth"

// [POST: /api/auth/login flow-1] Reads the login request
export async function login(req: Request, res: Response, next: Next) {
  try {
    const input = parseLogin(req.body)
    const session = await authenticate(input)

    // [POST: /api/auth/login flow-8] Sets the refresh cookie and returns the access token
    res.cookie("refresh_token", session.refreshToken, { httpOnly: true })
    res.status(200).json({ userId: session.userId, accessToken: session.accessToken })
  } catch (error) {
    next(error)
  }
}

// [POST: /api/auth/logout flow-1] Reads the refresh token cookie
export async function logout(req: Request, res: Response, next: Next) {
  try {
    const token = req.cookies.refresh_token
    // [POST: /api/auth/logout flow-1 fail:200] No cookie: nothing to revoke, answers as if logged out
    if (!token) return res.status(200).json({ ok: true })

    await revokeSession(token)

    // [POST: /api/auth/logout flow-4] Clears the cookie
    res.clearCookie("refresh_token").status(200).json({ ok: true })
  } catch (error) {
    next(error)
  }
}
