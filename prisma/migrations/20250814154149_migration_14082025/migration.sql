/*
  Warnings:

  - You are about to drop the column `createdAt` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `externalId` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `case_comments` table. All the data in the column will be lost.
  - You are about to drop the column `acknowledgedAt` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `assigneeName` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `closedAt` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `createdByName` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `custId` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `endTimestamp` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `modifiedBy` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `modifiedByName` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `startTimestamp` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `tenantName` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `lastSync` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[external_id]` on the table `alerts` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `external_id` to the `alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `cases` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `integrations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."alerts_externalId_key";

-- AlterTable
ALTER TABLE "public"."alerts" DROP COLUMN "createdAt",
DROP COLUMN "externalId",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "external_id" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."case_comments" DROP COLUMN "createdAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."cases" DROP COLUMN "acknowledgedAt",
DROP COLUMN "assigneeName",
DROP COLUMN "closedAt",
DROP COLUMN "createdAt",
DROP COLUMN "createdBy",
DROP COLUMN "createdByName",
DROP COLUMN "custId",
DROP COLUMN "endTimestamp",
DROP COLUMN "modifiedBy",
DROP COLUMN "modifiedByName",
DROP COLUMN "startTimestamp",
DROP COLUMN "tenantName",
DROP COLUMN "updatedAt",
ADD COLUMN     "acknowledged_at" TIMESTAMP(3),
ADD COLUMN     "assignee_name" TEXT,
ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "created_by_name" TEXT,
ADD COLUMN     "cust_id" TEXT,
ADD COLUMN     "end_timestamp" TIMESTAMP(3),
ADD COLUMN     "modified_by" TEXT,
ADD COLUMN     "modified_by_name" TEXT,
ADD COLUMN     "start_timestamp" TIMESTAMP(3),
ADD COLUMN     "tenant_name" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."integrations" DROP COLUMN "createdAt",
DROP COLUMN "lastSync",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_sync" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "alerts_external_id_key" ON "public"."alerts"("external_id");
