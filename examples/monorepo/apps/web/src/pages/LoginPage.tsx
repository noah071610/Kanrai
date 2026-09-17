import { useLogin } from "../api/auth"

export function LoginPage() {
  const login = useLogin()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        login.mutate({ email: String(form.get("email")), password: String(form.get("password")) })
      }}
    >
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button disabled={login.isPending}>Sign in</button>
    </form>
  )
}
