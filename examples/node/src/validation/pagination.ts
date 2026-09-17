import { HttpError } from "../lib/errors"

export interface PageInput {
  limit: number
  cursor?: string
}

// [GET: /api/users flow-3] Normalizes limit and cursor from the query string
export function parsePage(query: Record<string, string | undefined>): PageInput {
  const limit = Number.parseInt(query.limit ?? "20", 10)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    // [GET: /api/users flow-3 fail:400] limit is outside 1..100
    throw new HttpError(400, "limit must be between 1 and 100")
  }
  return { limit, cursor: query.cursor }
}
