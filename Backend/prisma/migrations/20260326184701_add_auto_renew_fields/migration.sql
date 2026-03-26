-- DropForeignKey
ALTER TABLE "Certificate" DROP CONSTRAINT "Certificate_assetId_fkey";

-- DropIndex
DROP INDEX "Certificate_cloudProviderId_idx";

-- DropIndex
DROP INDEX "Certificate_cloudRegion_idx";

-- DropIndex
DROP INDEX "Certificate_cloudResourceType_idx";

-- DropIndex
DROP INDEX "CloudProvider_userId_idx";

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastRenewal" TIMESTAMP(3),
ADD COLUMN     "renewalDaysBefore" INTEGER NOT NULL DEFAULT 30;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
