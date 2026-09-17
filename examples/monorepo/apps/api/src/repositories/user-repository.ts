import { db } from "../lib/prisma"

// [POST: /api/auth/login flow-4 db:users:read] Loads the user by email
export const findUserByEmail = (email: string) => db.user.findUnique({ where: { email } })
