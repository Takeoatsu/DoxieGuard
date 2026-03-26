/*
  Warnings:

  - A unique constraint covering the columns `[domain]` on the table `Certificate` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Certificate_domain_key" ON "Certificate"("domain");
