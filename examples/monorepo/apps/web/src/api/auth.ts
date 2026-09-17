import { useMutation } from "@tanstack/react-query"
import { http } from "../lib/http"

// [POST: /api/auth/login flow-0] Signs in from the login form
export const useLogin = () =>
  useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      http<{ accessToken: string }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: ({ accessToken }) => localStorage.setItem("accessToken", accessToken),
  })
