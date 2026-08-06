const http = require('http');
const { PrismaClient } = require('./packages/db/src/generated-client');
const prisma = new PrismaClient();

const REAL_HASH = '$argon2id$v=19$m=65536,p=4,t=3$8wgmYTLI8lZQFqWQW0dTtQ$O02F/uz4sswc2nStpwYvEbglrGUhS/TXPoxIDyvSBBo';

let resultText = 'Not run yet';

async function fixHashes() {
  const lines = [];
  lines.push('DATABASE_URL set: ' + !!process.env.DATABASE_URL);
  lines.push('DATABASE_URL: ' + (process.env.DATABASE_URL || '').substring(0, 50));
  
  try {
    const userCount = await prisma.user.count();
    lines.push('Total users: ' + userCount);
    
    const users = await prisma.user.findMany({ select: { id: true, email: true, passwordHash: true } });
    for (const u of users) {
      lines.push('  ' + u.email + ' -> ' + (u.passwordHash === REAL_HASH ? 'ALREADY FIXED' : 'NEEDS FIX'));
    }
    
    const result = await prisma.user.updateMany({
      where: { passwordHash: { not: REAL_HASH } },
      data: { passwordHash: REAL_HASH },
    });
    lines.push('Updated: ' + result.count + ' users');
  } catch (e) {
    lines.push('ERROR: ' + e.message);
    lines.push('Stack: ' + (e.stack || '').substring(0, 500));
  }
  
  resultText = lines.join('\n');
  console.error(resultText);
  await prisma.$disconnect();
}

fixHashes().then(() => {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200);
      res.end('ok');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(resultText);
    }
  });
  server.listen(process.env.PORT || 10000, () => {
    console.error('Fix server listening on port ' + (process.env.PORT || 10000));
  });
});
