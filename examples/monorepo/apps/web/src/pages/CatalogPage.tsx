import { useProducts } from "../api/products"

export function CatalogPage() {
  const { data: products = [] } = useProducts()
  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>
          <a href={`/products/${p.id}`}>{p.name}</a>
        </li>
      ))}
    </ul>
  )
}
