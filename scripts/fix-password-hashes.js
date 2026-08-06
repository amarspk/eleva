const fs = require('fs');
const { PrismaClient } = require('./packages/db/src/generated-client');
const prisma = new PrismaClient();

const REAL_HASH = '$argon2id$v=19$m=65536,p=4,t=3$8wgmYTLI8lZQFqWQW0dTtQ$O02F/uz4sswc2nStpwYvEbglrGUhS/TXPoxIDyvSBBo';

async function main() {
  const lines = [];
  lines.push('=== Fix Password Hashes ===');
  lines.push('DATABASE_URL set: ' + !!process.env.DATABASE_URL);
  lines.push('DATABASE_URL prefix: ' + (process.env.DATABASE_URL || '').substring(0, 30) + '...');
  
  try {
    const userCount = await prisma.user.count();
    lines.push('Total users in DB: ' + userCount);
    
    const users = await prisma.user.findMany({ select: { id: true, email: true, passwordHash: true } });
    lines.push('Users:');
    for (const u of users) {
      lines.push('  ' + u.email + ' hash=' + u.passwordHash.substring(0, 30) + '...');
    }
    
    const result = await prisma.user.updateMany({
      where: { passwordHash: { not: REAL_HASH } },
      data: { passwordHash: REAL_HASH },
    });
    lines.push('Updated ' + result.count + ' user(s) with real argon2 hash.');
  } catch (e) {
    lines.push('ERROR: ' + e.message);
  }
  
  const output = lines.join('\n');
  console.error(output);
  
  // Also write to uploads so we can fetch via API
  try {
    fs.mkdirSync('./apps/api/uploads', { recursive: true });
    fs.writeFileSync('./apps/api/uploads/fix-result.txt', output);
    lines.push('Result written to uploads/fix-result.txt');
  } catch (e) {
    lines.push('Could not write to uploads: ' + e.message);
  }
  
  await prisma.$disconnect();
}

main();
