-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('VIDEO', 'GRAPHIC');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'VIDEO',
    "filename" TEXT NOT NULL,
    "extraction" JSONB NOT NULL,
    "status" "IngestStatus" NOT NULL DEFAULT 'PENDING',
    "scriptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mediaId" TEXT,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "essence" TEXT NOT NULL,
    "quote" TEXT,
    "status" "IngestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_scriptId_key" ON "MediaAsset"("scriptId");

-- CreateIndex
CREATE INDEX "MediaAsset_clientId_status_idx" ON "MediaAsset"("clientId", "status");

-- CreateIndex
CREATE INDEX "Mention_clientId_status_idx" ON "Mention"("clientId", "status");

-- CreateIndex
CREATE INDEX "Tag_clientId_idx" ON "Tag"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_clientId_dimension_value_key" ON "Tag"("clientId", "dimension", "value");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
