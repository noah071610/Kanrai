import { randomUUID } from "node:crypto"
import { db } from "../lib/prisma"

// [POST: /api/auth/login flow-6 db:sessions:create] Stores a new session
export const createSession = (userId: string) =>
  db.session.create({
    data: { userId, accessToken: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) },
  })

export const findSessionUser = (accessToken: string) =>
  db.session.findFirst({
    where: { accessToken, expiresAt: { gt: new Date() } },
    include: { user: true },
  })
