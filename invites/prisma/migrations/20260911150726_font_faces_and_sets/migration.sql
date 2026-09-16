-- CreateEnum
CREATE TYPE "FontSource" AS ENUM ('GOOGLE', 'FILE');

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "fontSets" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "FontFace" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "stack" TEXT NOT NULL,
    "source" "FontSource" NOT NULL DEFAULT 'GOOGLE',
    "weights" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "licence" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FontFace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FontSet" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayKey" TEXT NOT NULL,
    "bodyKey" TEXT NOT NULL,
    "namesKey" TEXT NOT NULL DEFAULT '',
    "scriptKey" TEXT NOT NULL DEFAULT '',
    "scriptStyle" TEXT NOT NULL DEFAULT 'normal',
    "alsoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "voice" TEXT NOT NULL DEFAULT 'modern',
    "minTier" "Tier" NOT NULL DEFAULT 'COMPLETE',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FontSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FontFace_key_key" ON "FontFace"("key");

-- CreateIndex
CREATE INDEX "FontFace_enabled_sortOrder_idx" ON "FontFace"("enabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FontSet_key_key" ON "FontSet"("key");

-- CreateIndex
CREATE INDEX "FontSet_enabled_sortOrder_idx" ON "FontSet"("enabled", "sortOrder");
