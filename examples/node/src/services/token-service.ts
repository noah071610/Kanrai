import { createSession, deleteSessionByToken } from "../repositories/session-repository"

export async function issueSession(userId: string) {
  const refreshToken = `rt_${crypto.randomUUID()}`
  await createSession(userId, refreshToken)
  return { userId, refreshToken, accessToken: `at_${userId}` }
}

// [POST: /api/auth/logout flow-2] Revokes the session behind the refresh token
export async function revokeSession(refreshToken: string) {
  const deleted = await deleteSessionByToken(refreshToken)
  // [POST: /api/auth/logout flow-3 fail:200] Token was unknown or already revoked; still answers 200
  if (!deleted) return
}
