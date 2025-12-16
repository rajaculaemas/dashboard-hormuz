const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

/**
 * Hash password using PBKDF2
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function seedDefaultAdmin() {
  try {
    console.log('🌱 Seeding default admin user...\n');

    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: {
        role: 'administrator',
      },
    });

    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.name}`);
      return;
    }

    // Create admin user with default password
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = hashPassword(adminPassword);

    const admin = await prisma.user.create({
      data: {
        email: 'admin@soc-dashboard.local',
        name: 'Administrator',
        password: hashedPassword,
        role: 'administrator',
        status: 'active',
      },
    });

    console.log('✅ Default admin user created successfully!\n');
    console.log('📋 Admin Credentials:');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role: ${admin.role}`);
    console.log('\n⚠️  IMPORTANT: Change the default password after first login!');
    console.log('   You can set a custom admin password via ADMIN_PASSWORD environment variable.\n');
  } catch (error) {
    console.error('❌ Error seeding admin user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedDefaultAdmin();
