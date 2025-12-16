import axios from "axios"
import { useAuthStore } from "./stores/auth-store"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

// Add a request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Alert types
export interface Alert {
  id: string
  severity: "critical" | "high" | "medium" | "low" | "info"
  title: string
  description: string
  source: string
  timestamp: string
  status: "new" | "investigating" | "resolved" | "false-positive"
}

// Log types
export interface LogEntry {
  id: string
  timestamp: string
  level: "info" | "warning" | "error" | "debug"
  source: string
  message: string
  metadata: Record<string, any>
}

// Mock API functions
export const fetchAlerts = async (): Promise<Alert[]> => {
  // In a real app, this would be an API call
  // For demo purposes, we'll return mock data
  await new Promise((resolve) => setTimeout(resolve, 1000))

  return Array.from({ length: 10 }, (_, i) => ({
    id: `alert-${i}`,
    severity: ["critical", "high", "medium", "low", "info"][Math.floor(Math.random() * 5)] as Alert["severity"],
    title: `Suspicious activity detected ${i}`,
    description: `Potential security threat identified in system ${i}`,
    source: ["Firewall", "IDS", "Endpoint", "SIEM", "User Report"][Math.floor(Math.random() * 5)],
    timestamp: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
    status: ["new", "investigating", "resolved", "false-positive"][Math.floor(Math.random() * 4)] as Alert["status"],
  }))
}

export const fetchLogs = async (filters?: Record<string, any>): Promise<LogEntry[]> => {
  // In a real app, this would be an API call with filters
  await new Promise((resolve) => setTimeout(resolve, 1000))

  return Array.from({ length: 50 }, (_, i) => ({
    id: `log-${i}`,
    timestamp: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
    level: ["info", "warning", "error", "debug"][Math.floor(Math.random() * 4)] as LogEntry["level"],
    source: ["server", "application", "database", "network", "security"][Math.floor(Math.random() * 5)],
    message: `Log message ${i}: ${["User login", "Connection attempt", "Data access", "Configuration change", "System error"][Math.floor(Math.random() * 5)]}`,
    metadata: {
      ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
      user: `user${Math.floor(Math.random() * 100)}`,
      action: ["read", "write", "delete", "update", "create"][Math.floor(Math.random() * 5)],
    },
  }))
}
