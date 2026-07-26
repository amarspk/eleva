-- AlterTable: Add JSONB branding column for dynamic UI customization per DOC-001 §1.5
ALTER TABLE "tenants" ADD COLUMN "branding" JSONB DEFAULT '{}';
