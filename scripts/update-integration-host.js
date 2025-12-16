const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const id = process.argv[2];
const newHost = process.argv[3];

if (!id || !newHost) {
  console.error('Usage: node scripts/update-integration-host.js <integrationId> <host>');
  process.exit(1);
}

(async () => {
  try {
    const integ = await prisma.integration.findUnique({ where: { id } });
    if (!integ) {
      console.error('Integration not found for id:', id);
      process.exit(1);
    }

    console.log('Current credentials (DB):', JSON.stringify(integ.credentials, null, 2));

    let credentials = integ.credentials || {};

    // If credentials stored as array of { key, value }, convert to object
    if (Array.isArray(credentials)) {
      credentials = credentials.reduce((acc, cur) => {
        if (cur && typeof cur === 'object' && 'key' in cur) {
          acc[cur.key] = cur.value;
        }
        return acc;
      }, {});
    }

    // Set/update host
    credentials.host = newHost;

    const updated = await prisma.integration.update({
      where: { id },
      data: { credentials },
    });

    console.log('Updated credentials (DB):', JSON.stringify(updated.credentials, null, 2));
    console.log('Done. Now retry Test Connection from the UI or using the test endpoint.');
  } catch (err) {
    console.error('Error updating integration host:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
