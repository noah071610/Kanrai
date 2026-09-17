// Every request goes through here with the /api prefix added, so the paths in
// src/api/* are written without it. flow-0 annotations use the backend's full path.
const BASE = "/api"

export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("accessToken")
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}
