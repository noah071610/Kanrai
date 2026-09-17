import { mailgun } from "../lib/clients"
import { HttpError } from "../lib/errors"
import { deleteSessionsForUser } from "../repositories/session-repository"
import { deleteUserRow, findUserByEmail, saveUser } from "../repositories/user-repository"
import type { ProfilePatch } from "../validation/profile"

export async function updateProfile(userId: string, patch: ProfilePatch) {
  if (patch.email) {
    const owner = await findUserByEmail(patch.email)
    // [PATCH: /api/users/:id flow-4 fail:409] Email already belongs to another account
    if (owner && owner.id !== userId) throw new HttpError(409, "email taken")
  }
  return saveUser(userId, patch)
}

export async function removeAccount(user: { id: string; email: string }) {
  await deleteSessionsForUser(user.id)
  await deleteUserRow(user.id)

  try {
    // [DELETE: /api/users/:id flow-6 api:mailgun] Sends the goodbye email
    await mailgun.messages.create("example.com", { to: user.email, template: "goodbye" })
  } catch {
    // [DELETE: /api/users/:id flow-6 fail:204] Mail provider failed; the account is gone anyway, still 204
  }
}
