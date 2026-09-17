import { HttpError } from "../lib/errors"

export interface LoginInput {
  email: string
  password: string
}

// [POST: /api/auth/login flow-2] Validates the email and password shape
export function parseLogin(body: unknown): LoginInput {
  const { email, password } = (body ?? {}) as Partial<LoginInput>
  if (!email?.includes("@") || !password || password.length < 8) {
    // [POST: /api/auth/login flow-2 fail:400] Email is malformed or the password is shorter than 8
    throw new HttpError(400, "email and an 8-character password are required")
  }
  return { email, password }
}
