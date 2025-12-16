import { neon, neonConfig } from "@neondatabase/serverless"

// Set default fetch for serverless
neonConfig.fetchConnectionCache = true

export function getSql() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    throw new Error("Missing DATABASE_URL environment variable. Set DATABASE_URL to your Neon connection string.")
  }

  try {
    const sql = neon(DATABASE_URL)
    return sql
  } catch (error) {
    console.error("[v0] Failed to create SQL client:", error)
    throw new Error(`Failed to initialize database client: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

export default getSql
