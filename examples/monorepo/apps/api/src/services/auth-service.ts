import { HttpError } from "../lib/errors"
import { createSession } from "../repositories/session-repository"
import { findUserByEmail } from "../repositories/user-repository"
import type { LoginInput } from "../validation/auth"

declare function verifyPassword(hash: string, password: string): Promise<boolean>

// [POST: /api/auth/login flow-3] Checks the credentials
export async function authenticate({ email, password }: LoginInput) {
  const user = await findUserByEmail(email)
  // [POST: /api/auth/login flow-4 fail:401] No account with that email
  if (!user) throw new HttpError(401, "invalid credentials")
  // [POST: /api/auth/login flow-5] Compares the password hash
  // [POST: /api/auth/login flow-5 fail:401] Password does not match
  if (!(await verifyPassword(user.passwordHash, password))) throw new HttpError(401, "invalid credentials")
  return createSession(user.id)
}
