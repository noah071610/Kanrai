import { HttpError } from "../lib/errors"

export interface LoginInput {
  email: string
  password: string
}

// [POST: /api/auth/login flow-2] Validates email and password
export function parseLogin(body: any): LoginInput {
  if (typeof body?.email !== "string" || typeof body?.password !== "string") {
    // [POST: /api/auth/login flow-2 fail:400] Body is missing email or password
    throw new HttpError(400, "invalid body")
  }
  return { email: body.email, password: body.password }
}
