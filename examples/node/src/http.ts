export interface Request<TBody = any> {
  body: TBody
  params: Record<string, string>
  query: Record<string, string | undefined>
  headers: Record<string, string | undefined>
  cookies: Record<string, string | undefined>
  rawBody: string
}

export interface Response {
  status(code: number): this
  cookie(name: string, value: string, options: { httpOnly: boolean }): this
  clearCookie(name: string): this
  json(body: unknown): void
  end(): void
}

export type Next = (error: unknown) => void
export type Handler = (req: Request, res: Response, next: Next) => Promise<unknown>

export interface Router {
  get(path: string, handler: Handler): void
  post(path: string, handler: Handler): void
  patch(path: string, handler: Handler): void
  delete(path: string, handler: Handler): void
}
