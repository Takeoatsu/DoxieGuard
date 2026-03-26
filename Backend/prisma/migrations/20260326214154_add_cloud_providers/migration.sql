-- Migration: Add Cloud Providers support
-- Created: 2026-03-26

-- Create CloudProvider table
CREATE TABLE "CloudProvider" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "regions" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSync" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudProvider_pkey" PRIMARY KEY ("id")
);

-- Add relationship between CloudProvider and User
ALTER TABLE "CloudProvider" 
ADD CONSTRAINT "CloudProvider_userId_fkey" 
FOREIGN KEY ("userId") 
REFERENCES "User"("id") 
ON DELETE RESTRICT 
ON UPDATE CASCADE;

-- Add cloud-specific fields to Certificate table
ALTER TABLE "Certificate" 
ADD COLUMN "cloudProviderId" TEXT;

ALTER TABLE "Certificate" 
ADD COLUMN "cloudResourceType" TEXT;

ALTER TABLE "Certificate" 
ADD COLUMN "cloudResourceId" TEXT;

ALTER TABLE "Certificate" 
ADD COLUMN "cloudRegion" TEXT;

ALTER TABLE "Certificate" 
ADD COLUMN "certificateContent" TEXT;

ALTER TABLE "Certificate" 
ADD COLUMN "privateKeyContent" TEXT;

ALTER TABLE "Certificate" 
ADD COLUMN "issuedAt" TIMESTAMP(3);

-- Make assetId optional (nullable) since cloud certificates may not have an asset
ALTER TABLE "Certificate" 
ALTER COLUMN "assetId" DROP NOT NULL;

-- Add relationship between Certificate and CloudProvider
ALTER TABLE "Certificate" 
ADD CONSTRAINT "Certificate_cloudProviderId_fkey" 
FOREIGN KEY ("cloudProviderId") 
REFERENCES "CloudProvider"("id") 
ON DELETE SET NULL 
ON UPDATE CASCADE;

-- Create indexes for better performance
CREATE INDEX "CloudProvider_userId_idx" ON "CloudProvider"("userId");
CREATE INDEX "Certificate_cloudProviderId_idx" ON "Certificate"("cloudProviderId");
CREATE INDEX "Certificate_cloudResourceType_idx" ON "Certificate"("cloudResourceType");
CREATE INDEX "Certificate_cloudRegion_idx" ON "Certificate"("cloudRegion");

-- Add comment for documentation
COMMENT ON COLUMN "Certificate"."cloudResourceType" IS 'Type of cloud resource: acm, elb, cloudfront, keyvault, etc.';
COMMENT ON COLUMN "Certificate"."cloudResourceId" IS 'Cloud-specific resource identifier: ARN, Resource ID, Distribution ID, etc.';
COMMENT ON COLUMN "Certificate"."cloudRegion" IS 'AWS region, Azure region, GCP region, etc.';
