const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const list = await prisma.integration.findMany();
    console.log('Integrations:');
    list.forEach((i) => {
      console.log({ id: i.id, name: i.name, source: i.source, status: i.status, credentials: i.credentials });
    });
  } catch (err) {
    console.error('Error listing integrations:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
