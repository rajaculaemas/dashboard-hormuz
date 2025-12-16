import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding integrations...')

  // Create Wazuh integration
  const wazuh = await prisma.integration.upsert({
    where: { id: 'cmipjqkb90000jw7g74ihysh3' },
    update: {},
    create: {
      id: 'cmipjqkb90000jw7g74ihysh3',
      name: 'Wazuh-POS',
      source: 'wazuh',
      status: 'active',
      config: {
        host: process.env.WAZUH_API_HOST || 'localhost',
        port: parseInt(process.env.WAZUH_API_PORT || '55000'),
      },
      lastSync: new Date(),
    },
  })
  console.log('Created Wazuh integration:', wazuh)

  // Create QRadar integration if needed
  const qradar = await prisma.integration.upsert({
    where: { id: 'qradar-integration' },
    update: {},
    create: {
      id: 'qradar-integration',
      name: 'QRadar',
      source: 'qradar',
      status: 'active',
      config: {
        host: process.env.QRADAR_HOST || 'localhost',
      },
      lastSync: new Date(),
    },
  })
  console.log('Created QRadar integration:', qradar)

  // Create Stellar Cyber TVRI integration if needed
  const stellarTVRI = await prisma.integration.upsert({
    where: { id: 'stellar-cyber-tvri-integration' },
    update: {},
    create: {
      id: 'stellar-cyber-tvri-integration',
      name: 'Stellar Cyber TVRI',
      source: 'stellar_cyber',
      status: 'active',
      config: {
        host: process.env.STELLAR_CYBER_HOST || 'localhost',
      },
      lastSync: new Date(),
    },
  })
  console.log('Created Stellar Cyber TVRI integration:', stellarTVRI)

  // Create Stellar Cyber integration if needed
  const stellar = await prisma.integration.upsert({
    where: { id: 'stellar-cyber-integration' },
    update: {},
    create: {
      id: 'stellar-cyber-integration',
      name: 'Stellar Cyber',
      source: 'stellar_cyber',
      status: 'active',
      config: {
        host: process.env.STELLAR_CYBER_HOST || 'localhost',
      },
      lastSync: new Date(),
    },
  })
  console.log('Created Stellar Cyber integration:', stellar)

  console.log('Seed completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
