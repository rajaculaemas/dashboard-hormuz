import { create } from "zustand"
import { persist } from "zustand/middleware"

export type UserRole = "administrator" | "analyst" | "read-only" | "admin" | "operator" | "trainee"

interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatar?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: async (email, password) => {
        try {
          // In a real app, this would be an API call
          // For demo purposes, we'll simulate a successful login
          await new Promise((resolve) => setTimeout(resolve, 1000))

          // Mock user data based on email
          let role: UserRole = "analyst"
          if (email.includes("admin")) role = "admin"
          if (email.includes("operator")) role = "operator"
          if (email.includes("trainee")) role = "trainee"

          const user = {
            id: "1",
            name: email.split("@")[0],
            email,
            role,
            avatar: `https://avatar.vercel.sh/${email}`,
          }

          set({
            user,
            token: "mock-jwt-token",
            isAuthenticated: true,
          })
        } catch (error) {
          console.error("Login failed:", error)
          throw new Error("Invalid credentials")
        }
      },
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
      },
      setUser: (user: User | null) => {
        set({ user, isAuthenticated: user !== null })
      },
    }),
    {
      name: "auth-storage",
    },
  ),
)
