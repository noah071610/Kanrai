// The admin app talks to the API host directly instead of through a proxy.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(API_URL + path, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem("adminToken")}` },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

// [GET: /api/products flow-0] Loads the inventory table
export const fetchInventory = () => get<{ id: string; name: string; stock: number }[]>("/api/products")

// [GET: /api/orders flow-0] Loads every order for the admin dashboard
export const fetchAllOrders = () => get<unknown[]>("/api/orders")
