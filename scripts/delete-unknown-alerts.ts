import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  try {
    // Delete all unknown alerts from Wazuh integration
    const wazuhIntegration = await prisma.integration.findFirst({
      where: {
        source: "wazuh",
      },
    })

    if (!wazuhIntegration) {
      console.log("Wazuh integration not found")
      return
    }

    const deleted = await prisma.alert.deleteMany({
      where: {
        title: {
            contains: "SSL VPN tunnel up",
            mode: "insensitive",
        },
      },
    })

    console.log(`✓ Deleted ${deleted.count} SSL VPN tunnel up`)
  } catch (error) {
    console.error("Error:", error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
