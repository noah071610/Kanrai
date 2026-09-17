import { HttpError } from "../lib/errors"
import { findUserByEmail } from "../repositories/user-repository"
import type { LoginInput } from "../validation/auth"
import { issueSession } from "./token-service"

// [POST: /api/auth/login flow-3] Checks the credentials and opens a session
export async function authenticate(input: LoginInput) {
  const user = await findUserByEmail(input.email)
  // [POST: /api/auth/login flow-4 fail:401] No account with that email
  if (!user) throw new HttpError(401, "invalid credentials")

  // [POST: /api/auth/login flow-5] Rejects locked accounts before looking at the password
  // [POST: /api/auth/login flow-5 fail:423] Account is locked
  if (user.status === "locked") throw new HttpError(423, "account locked")

  // [POST: /api/auth/login flow-6] Compares the password with the stored hash
  if (user.passwordHash !== `hash:${input.password}`) {
    // [POST: /api/auth/login flow-6 fail:401] Password does not match
    throw new HttpError(401, "invalid credentials")
  }

  return issueSession(user.id)
}
