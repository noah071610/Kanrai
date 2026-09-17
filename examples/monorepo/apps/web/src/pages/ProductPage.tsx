import { usePlaceOrder } from "../api/orders"
import { useProduct } from "../api/products"

export function ProductPage({ id }: { id: string }) {
  const { data: product } = useProduct(id)
  const placeOrder = usePlaceOrder()
  if (!product) return null
  return (
    <section>
      <h1>{product.name}</h1>
      <p>${(product.priceCents / 100).toFixed(2)}</p>
      <button onClick={() => placeOrder.mutate({ productId: product.id, quantity: 1 })}>Buy now</button>
    </section>
  )
}
