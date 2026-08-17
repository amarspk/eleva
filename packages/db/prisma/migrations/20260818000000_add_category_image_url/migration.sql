-- Phase 4 P1 — Category images.
-- Real restaurant category photos managed through the existing media library;
-- the column follows Product.imageUrl's convention (nullable VarChar(2048)).
ALTER TABLE "categories" ADD COLUMN "imageUrl" VARCHAR(2048);
