import { HttpError } from "../lib/errors"

export interface ProfilePatch {
  email?: string
  displayName?: string
}

// [PATCH: /api/users/:id flow-3] Keeps only the editable fields
export function parseProfilePatch(body: unknown): ProfilePatch {
  const { email, displayName } = (body ?? {}) as ProfilePatch
  if (email !== undefined && !email.includes("@")) {
    // [PATCH: /api/users/:id flow-3 fail:400] Email is malformed
    throw new HttpError(400, "invalid email")
  }
  return { email, displayName }
}
