const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://doxieroot:doxiepassword123@localhost:5432/doxiedb';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'admin@doxieguard.com' },
    update: {},
    create: { email: 'admin@doxieguard.com' }
  });

  const asset = await prisma.asset.upsert({
    where: { agentToken: 'token-Servidor-Local-Santi' },
    update: { name: 'Servidor-Local-Santi', userId: user.id },
    create: { name: 'Servidor-Local-Santi', agentToken: 'token-Servidor-Local-Santi', userId: user.id }
  });

  const cert = await prisma.certificate.upsert({
    where: { domain: 'servidor-fantasma-doxie.com' },
    update: { expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), status: 'ACTIVE', assetId: asset.id },
    create: {
      domain: 'servidor-fantasma-doxie.com',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      assetId: asset.id
    }
  });

  console.log('Upserted:', { user: user.email, asset: asset.agentToken, certificate: cert.domain });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});