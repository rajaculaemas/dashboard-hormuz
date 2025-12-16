import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';

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

    // Test password verification
    const testPassword = 'admin123';
    const isValid = verifyPassword(testPassword, user.password);
    console.log('  Password test ("admin123"):', isValid ? '✅ VALID' : '❌ INVALID');

    if (!isValid) {
      console.log('\n⚠️ Password mismatch! Need to re-seed.');
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAuth();
