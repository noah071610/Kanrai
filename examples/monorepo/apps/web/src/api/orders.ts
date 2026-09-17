import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { http } from "../lib/http"

// [GET: /api/orders flow-0] Loads the customer's order history
export const useMyOrders = () =>
  useQuery({ queryKey: ["orders"], queryFn: () => http<unknown[]>("/orders") })

// [POST: /api/orders flow-0] Places an order at checkout
export const usePlaceOrder = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { productId: string; quantity: number }) =>
      http("/orders", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  })
}
