import { db } from "../lib/clients"

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

// [POST: /api/auth/login flow-7 db:sessions:create] Stores the refresh token with a 30-day expiry
export async function createSession(userId: string, refreshToken: string) {
  return db.session.create({
    data: { userId, refreshToken, expiresAt: new Date(Date.now() + THIRTY_DAYS) },
  })
}

// [POST: /api/auth/logout flow-3 db:sessions:delete] Deletes the session row for the token
export async function deleteSessionByToken(refreshToken: string) {
  const { count } = await db.session.deleteMany({ where: { refreshToken } })
  return count > 0
}

// [GET: /api/users flow-2 db:sessions:read] Resolves the bearer token to a live session and user
// [PATCH: /api/users/:id flow-2 db:sessions:read] Resolves the bearer token to a live session and user
// [DELETE: /api/users/:id flow-2 db:sessions:read] Resolves the bearer token to a live session and user
// [POST: /api/orders flow-2 db:sessions:read] Resolves the bearer token to a live session and user
// [POST: /api/orders/:id/cancel flow-2 db:sessions:read] Resolves the bearer token to a live session and user
export async function findSessionUser(accessToken: string) {
  return db.session.findFirst({
    where: { user: { id: accessToken.replace(/^at_/, "") }, expiresAt: { gt: new Date() } },
    include: { user: true },
  })
}

// [DELETE: /api/users/:id flow-4 db:sessions:delete] Signs the user out everywhere
export async function deleteSessionsForUser(userId: string) {
  return db.session.deleteMany({ where: { userId } })
}
