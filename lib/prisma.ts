import { PrismaClient } from "@prisma/client"

const globalForPrisma = global as unknown as { prisma?: PrismaClient }

let prisma: PrismaClient

try {
  if (globalForPrisma.prisma) {
    prisma = globalForPrisma.prisma
    console.log("[Prisma] Using existing client from global")
  } else {
    prisma = new PrismaClient()
    console.log("[Prisma] Creating new PrismaClient")
    
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = prisma
    }
  }
} catch (error) {
  console.error("[Prisma] Failed to initialize PrismaClient:", error)
  throw error
}

console.log("[Prisma] Client initialized successfully")

export { prisma }
export default prisma
