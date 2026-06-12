-- AlterEnum
ALTER TYPE "VerificationType" ADD VALUE 'INVITE';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "trustedTokenHash" TEXT,
ADD COLUMN     "trustedUntil" TIMESTAMP(3);
