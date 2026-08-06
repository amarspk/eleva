const { PrismaClient } = require('./packages/db/src/generated-client');
const prisma = new PrismaClient();

const REAL_HASH = '$argon2id$v=19$m=65536,p=4,t=3$8wgmYTLI8lZQFqWQW0dTtQ$O02F/uz4sswc2nStpwYvEbglrGUhS/TXPoxIDyvSBBo';

async function main() {
  console.log('=== Fix Password Hashes ===');
  console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
  
  const userCount = await prisma.user.count();
  console.log('Total users in DB:', userCount);
  
  const users =? = await prisma.user.findMany({ select: { id: true, email: true, passwordHash: true } });
  console.log('Users:');
  for (const u of users) {
    console.log(`  ${u.email} hash=${u.passwordHash.substring(0, 20)}...`);
  }
  
  const result = await prisma.user.updateMany({
    where: { passwordHash: { not: REAL_HASH } },
    data: { passwordHash: REAL_HASH },
  });
  console.log(`Updated ${result.count} user(s) with real argon2 hash.`);
}

main()
  .catch(e => { console.error('Failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
