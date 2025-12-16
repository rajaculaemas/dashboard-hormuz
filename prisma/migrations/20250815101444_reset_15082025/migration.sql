/*
  Warnings:

  - You are about to drop the column `created_at` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `external_id` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `index` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `integration_id` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `acknowledged_at` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `assignee_name` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `closed_at` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `created_by_name` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `cust_id` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `end_timestamp` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `external_id` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `integration_id` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `modified_by` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `modified_by_name` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `start_timestamp` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_name` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `ticket_id` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `last_sync_at` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `method` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `alert_comments` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[externalId]` on the table `alerts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalId]` on the table `cases` will be added. If there are existing duplicate values, this will fail.
  - The required column `externalId` was added to the `alerts` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `integrationId` to the `alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `externalId` to the `cases` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `cases` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ticketId` to the `cases` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `cases` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `integrations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."alert_comments" DROP CONSTRAINT "alert_comments_alertId_fkey";

-- DropForeignKey
ALTER TABLE "public"."alerts" DROP CONSTRAINT "alerts_integration_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."cases" DROP CONSTRAINT "cases_integration_id_fkey";

-- DropIndex
DROP INDEX "public"."alerts_external_id_key";

-- DropIndex
DROP INDEX "public"."cases_external_id_key";

-- AlterTable
ALTER TABLE "public"."alerts" DROP COLUMN "created_at",
DROP COLUMN "external_id",
DROP COLUMN "index",
DROP COLUMN "integration_id",
DROP COLUMN "score",
DROP COLUMN "source",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "externalId" TEXT NOT NULL,
ADD COLUMN     "integrationId" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."cases" DROP COLUMN "acknowledged_at",
DROP COLUMN "assignee_name",
DROP COLUMN "closed_at",
DROP COLUMN "created_at",
DROP COLUMN "created_by",
DROP COLUMN "created_by_name",
DROP COLUMN "cust_id",
DROP COLUMN "end_timestamp",
DROP COLUMN "external_id",
DROP COLUMN "integration_id",
DROP COLUMN "modified_by",
DROP COLUMN "modified_by_name",
DROP COLUMN "start_timestamp",
DROP COLUMN "tenant_name",
DROP COLUMN "ticket_id",
DROP COLUMN "updated_at",
ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "assigneeName" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "custId" TEXT,
ADD COLUMN     "endTimestamp" TIMESTAMP(3),
ADD COLUMN     "externalId" TEXT NOT NULL,
ADD COLUMN     "integrationId" TEXT NOT NULL,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "modifiedByName" TEXT,
ADD COLUMN     "startTimestamp" TIMESTAMP(3),
ADD COLUMN     "tenantName" TEXT,
ADD COLUMN     "ticketId" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "score" DROP NOT NULL,
ALTER COLUMN "size" DROP NOT NULL,
ALTER COLUMN "version" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."integrations" DROP COLUMN "created_at",
DROP COLUMN "description",
DROP COLUMN "last_sync_at",
DROP COLUMN "method",
DROP COLUMN "type",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastSync" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'inactive';

-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "created_at",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- DropTable
DROP TABLE "public"."alert_comments";

-- CreateIndex
CREATE UNIQUE INDEX "alerts_externalId_key" ON "public"."alerts"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "cases_externalId_key" ON "public"."cases"("externalId");

-- AddForeignKey
ALTER TABLE "public"."alerts" ADD CONSTRAINT "alerts_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cases" ADD CONSTRAINT "cases_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
