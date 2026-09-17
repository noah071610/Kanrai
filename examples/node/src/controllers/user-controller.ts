import type { Next, Request, Response } from "../http"
import { requireAdmin, requireUser } from "../lib/auth"
import { HttpError } from "../lib/errors"
import { findUserById, findUserPage } from "../repositories/user-repository"
import { removeAccount, updateProfile } from "../services/user-service"
import { parsePage } from "../validation/pagination"
import { parseProfilePatch } from "../validation/profile"

// [GET: /api/users flow-1] Admin-only user listing
export async function listUsers(req: Request, res: Response, next: Next) {
  try {
    await requireAdmin(req)
    const page = parsePage(req.query)
    const users = await findUserPage(page)

    // [GET: /api/users flow-5] Returns the page with a cursor for the next one
    res.status(200).json({ data: users, nextCursor: users.at(-1)?.id ?? null })
  } catch (error) {
    next(error)
  }
}

// [GET: /api/users/:id flow-1] Public profile lookup
export async function getUser(req: Request, res: Response, next: Next) {
  try {
    const user = await findUserById(req.params.id)
    // [GET: /api/users/:id flow-2 fail:404] No user with that id
    if (!user) throw new HttpError(404, "user not found")

    // [GET: /api/users/:id flow-3] Returns only the public fields
    res.status(200).json({ id: user.id, displayName: user.displayName })
  } catch (error) {
    next(error)
  }
}

// [PATCH: /api/users/:id flow-1] Profile update by the owner or an admin
export async function updateUser(req: Request, res: Response, next: Next) {
  try {
    const caller = await requireUser(req)
    if (caller.id !== req.params.id && caller.role !== "admin") {
      // [PATCH: /api/users/:id flow-2 fail:403] Caller is neither the owner nor an admin
      throw new HttpError(403, "forbidden")
    }
    const patch = parseProfilePatch(req.body)
    const user = await updateProfile(req.params.id, patch)

    // [PATCH: /api/users/:id flow-6] Returns the updated profile
    res.status(200).json(user)
  } catch (error) {
    next(error)
  }
}

// [DELETE: /api/users/:id flow-1] Admin deletes an account
export async function deleteUser(req: Request, res: Response, next: Next) {
  try {
    await requireAdmin(req)
    const user = await findUserById(req.params.id)
    // [DELETE: /api/users/:id flow-3 fail:404] No user with that id
    if (!user) throw new HttpError(404, "user not found")

    await removeAccount(user)

    // [DELETE: /api/users/:id flow-7] Answers 204 with no body
    res.status(204).end()
  } catch (error) {
    next(error)
  }
}
