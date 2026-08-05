const { PrismaClient } = require('../packages/db/src/generated-client');
const prisma = new PrismaClient();

const REAL_HASH = '$argon2id$v=19$m=65536,p=4,t=3$dX1bocpSJWrxIW0IXEf/0Q$8YXKPPaffOj6N9Dlun+3TfLsENBDzUEgFVDRlOtGBYk';

async function main() {
  console.log('Fixing password hashes...');
  const result = await prisma.user.updateMany({
    where: { passwordHash: { not: REAL_HASH } },
    data: { passwordHash: REAL_HASH },
  });
  console.log(`Updated ${result.count} user(s) with real argon2 hash.`);
}

main()
  .catch(e => { console.error('Failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
