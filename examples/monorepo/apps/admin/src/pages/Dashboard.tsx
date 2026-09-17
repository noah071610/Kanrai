import { useEffect, useState } from "react"
import { fetchAllOrders, fetchInventory } from "../lib/api"

export function Dashboard() {
  const [inventory, setInventory] = useState<{ id: string; name: string; stock: number }[]>([])
  const [orders, setOrders] = useState<unknown[]>([])

  useEffect(() => {
    void fetchInventory().then(setInventory)
    void fetchAllOrders().then(setOrders)
  }, [])

  return (
    <main>
      <h2>Inventory</h2>
      <ul>
        {inventory.map((p) => (
          <li key={p.id}>
            {p.name}: {p.stock}
          </li>
        ))}
      </ul>
      <h2>Orders ({orders.length})</h2>
    </main>
  )
}
