-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'LOGO', 'BANNER', 'AVATAR', 'DOCUMENT');

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" VARCHAR(255) NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "originalFileSize" INTEGER NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "storageKey" VARCHAR(1024) NOT NULL,
    "storageProvider" VARCHAR(50) NOT NULL DEFAULT 'local',
    "originalUrl" VARCHAR(2048) NOT NULL,
    "thumbnailUrl" VARCHAR(2048),
    "mediumUrl" VARCHAR(2048),
    "largeUrl" VARCHAR(2048),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ready',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_media_tenant_entity" ON "media"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "idx_media_tenant_type" ON "media"("tenantId", "mediaType");

-- CreateIndex
CREATE INDEX "idx_media_tenant_checksum" ON "media"("tenantId", "checksum");

-- CreateIndex
CREATE INDEX "idx_media_storage_key" ON "media"("storageKey");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
