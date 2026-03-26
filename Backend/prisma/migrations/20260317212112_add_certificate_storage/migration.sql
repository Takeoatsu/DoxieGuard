-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "certificateContent" TEXT,
ADD COLUMN     "dnsProviderId" TEXT,
ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "privateKeyContent" TEXT;

-- CreateTable
CREATE TABLE "DnsProvider" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DnsProvider_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_dnsProviderId_fkey" FOREIGN KEY ("dnsProviderId") REFERENCES "DnsProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DnsProvider" ADD CONSTRAINT "DnsProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
