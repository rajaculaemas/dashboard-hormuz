import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const DATABASE_URL = process.env.DATABASE_URL || "NOT SET"
  const masked = DATABASE_URL.startsWith("postgresql://") 
    ? DATABASE_URL.replace(/(:[^@]+@)/, ":***@")
    : DATABASE_URL

  return NextResponse.json({
    DATABASE_URL_set: DATABASE_URL !== "NOT SET",
    DATABASE_URL_masked: masked,
    NODE_ENV: process.env.NODE_ENV,
    all_env_keys: Object.keys(process.env)
      .filter(k => k.includes("DATABASE") || k.includes("NEXT"))
      .sort()
  })
}
