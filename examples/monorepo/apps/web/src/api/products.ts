import { useQuery } from "@tanstack/react-query"
import { http } from "../lib/http"

export interface Product {
  id: string
  name: string
  priceCents: number
  stock: number
}

// [GET: /api/products flow-0] Loads the storefront catalog
export const useProducts = () =>
  useQuery({ queryKey: ["products"], queryFn: () => http<Product[]>("/products") })

// [GET: /api/products/:id flow-0] Loads a product detail page
export const useProduct = (id: string) =>
  useQuery({ queryKey: ["products", id], queryFn: () => http<Product>(`/products/${id}`) })
