/*
  Warnings:

  - A unique constraint covering the columns `[orgId,parentId,code]` on the table `OrgUnit` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "OrgUnit_orgId_code_key";

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnit_orgId_parentId_code_key" ON "OrgUnit"("orgId", "parentId", "code");
