const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  try {
    const a = await prisma.asset.findFirst({
      where: { agentToken: 'token-Servidor-Local-Santi' }
    });
    console.log('FOUND', a);
  } catch (e) {
    console.error('ERROR', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();