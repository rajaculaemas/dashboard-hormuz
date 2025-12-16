const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function verifyPassword(password, hash) {
  const [salt, storedHash] = hash.split(':');
  if (!salt || !storedHash) return false;
  
  const computedHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return computedHash === storedHash;
}

async function checkAuth() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'admin@soc-dashboard.local' },
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ User found:');
    console.log('  Email:', user.email);
    console.log('  Name:', user.name);
    console.log('  Role:', user.role);
    console.log('  Status:', user.status);
    console.log('  Password hash:', user.password.substring(0, 50) + '...');

    // Test password verification
    const testPassword = 'admin123';
    const isValid = verifyPassword(testPassword, user.password);
    console.log('\n  Password test ("admin123"):', isValid ? '✅ VALID' : '❌ INVALID');

    if (!isValid) {
      console.log('\n⚠️ Password mismatch! Need to re-seed.');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAuth();
