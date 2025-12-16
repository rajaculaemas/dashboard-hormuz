import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function fixCredentials() {
  try {
    console.log("Checking integrations in database...")

    const integrations = await prisma.integration.findMany()

    console.log(`Found ${integrations.length} integrations`)

    for (const integration of integrations) {
      console.log(`\nIntegration ID: ${integration.id}`)
      console.log(`Name: ${integration.name}`)
      console.log(`Source: ${integration.source}`)
      console.log(`Status: ${integration.status}`)
      console.log("Current Credentials:", integration.credentials)

      // Cek apakah kredensial adalah array
      if (Array.isArray(integration.credentials)) {
        console.log("Credentials are in array format, converting to object format...")

        // Konversi dari array ke objek
        const credentialsArray = integration.credentials as any[]
        const credentialsObject: Record<string, string> = {}

        credentialsArray.forEach((cred) => {
          if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
            credentialsObject[cred.key] = cred.value
          }
        })

        console.log("Converted credentials:", credentialsObject)

        // Update kredensial di database
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            credentials: credentialsObject,
          },
        })

        console.log("Credentials updated successfully")
      } else {
        console.log("Credentials are already in object format, no need to convert")
      }
    }

    console.log("\nAll integrations processed successfully")
  } catch (error) {
    console.error("Error fixing credentials:", error)
  } finally {
    await prisma.$disconnect()
  }
}

fixCredentials()
