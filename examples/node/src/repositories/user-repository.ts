import { db } from "../lib/clients"
import type { PageInput } from "../validation/pagination"

// [POST: /api/auth/login flow-4 db:users:read] Loads the account and password hash by email
// [PATCH: /api/users/:id flow-4 db:users:read] Checks whether the new email is already taken
export async function findUserByEmail(email: string) {
  return db.user.findUnique({ where: { email } })
}

// [GET: /api/users/:id flow-2 db:users:read] Loads one user by id
// [DELETE: /api/users/:id flow-3 db:users:read] Loads the user to delete
export async function findUserById(id: string) {
  return db.user.findUnique({ where: { id } })
}

// [GET: /api/users flow-4 db:users:read] Loads one page of users, newest first
export async function findUserPage(page: PageInput) {
  return db.user.findMany({
    take: page.limit,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
  })
}

// [PATCH: /api/users/:id flow-5 db:users:update] Saves the changed profile fields
export async function saveUser(id: string, patch: { email?: string; displayName?: string }) {
  return db.user.update({ where: { id }, data: patch })
}

// [DELETE: /api/users/:id flow-5 db:users:delete] Deletes the user row
export async function deleteUserRow(id: string) {
  return db.user.delete({ where: { id } })
}
