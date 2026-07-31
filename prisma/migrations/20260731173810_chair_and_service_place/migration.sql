-- AlterEnum
ALTER TYPE "ResourceType" ADD VALUE 'CHAIR';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "requiredResourceType" "ResourceType";
