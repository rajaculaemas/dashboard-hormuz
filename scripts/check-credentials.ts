import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function checkCredentials() {
  try {
    console.log("Checking integrations in database...")

    const integrations = await prisma.integration.findMany()

    console.log(`Found ${integrations.length} integrations`)

    for (const integration of integrations) {
      console.log(`\nIntegration ID: ${integration.id}`)
      console.log(`Name: ${integration.name}`)
      console.log(`Source: ${integration.source}`)
      console.log(`Status: ${integration.status}`)
      console.log("Credentials:")

      const credentials = integration.credentials as Record<string, any>

      // Cek apakah kredensial ada dan valid
      if (!credentials) {
        console.log("  No credentials found!")
      } else {
        // Cek format kredensial
        const hasHost = credentials.host || credentials.STELLAR_CYBER_HOST
        const hasUserId = credentials.user_id || credentials.STELLAR_CYBER_USER_ID
        const hasRefreshToken = credentials.refresh_token || credentials.STELLAR_CYBER_REFRESH_TOKEN
        const hasTenantId = credentials.tenant_id || credentials.STELLAR_CYBER_TENANT_ID

        console.log(`  Host: ${hasHost ? "Present" : "Missing"}`)
        console.log(`  User ID: ${hasUserId ? "Present" : "Missing"}`)
        console.log(`  Refresh Token: ${hasRefreshToken ? "Present" : "Missing"}`)
        console.log(`  Tenant ID: ${hasTenantId ? "Present" : "Missing"}`)

        // Tampilkan kredensial (kecuali refresh token)
        Object.entries(credentials).forEach(([key, value]) => {
          if (
            key.toLowerCase().includes("token") ||
            key.toLowerCase().includes("secret") ||
            key.toLowerCase().includes("password")
          ) {
            console.log(`  ${key}: [REDACTED]`)
          } else {
            console.log(`  ${key}: ${value}`)
          }
        })
      }
    }
  } catch (error) {
    console.error("Error checking credentials:", error)
  } finally {
    await prisma.$disconnect()
  }
}

checkCredentials()
