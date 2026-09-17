export interface Request<TBody = any> {
  body: TBody
  params: Record<string, string>
  headers: Record<string, string | undefined>
}

export interface Response {
  status(code: number): this
  json(body: unknown): void
}

export type Next = (error: unknown) => void
export type Handler = (req: Request, res: Response, next: Next) => Promise<unknown>

export interface Router {
  get(path: string, handler: Handler): void
  post(path: string, handler: Handler): void
}
