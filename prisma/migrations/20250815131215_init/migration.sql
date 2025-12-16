/*
  Warnings:

  - You are about to drop the column `createdAt` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `externalId` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `alertId` on the `case_alerts` table. All the data in the column will be lost.
  - You are about to drop the column `caseId` on the `case_alerts` table. All the data in the column will be lost.
  - You are about to drop the column `caseId` on the `case_comments` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `case_comments` table. All the data in the column will be lost.
  - The primary key for the `cases` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `acknowledgedAt` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `assigneeName` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `closedAt` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `createdByName` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `custId` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `endTimestamp` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `externalId` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `modifiedBy` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `modifiedByName` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `mttd` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `startTimestamp` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `tenantName` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `ticketId` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `lastSync` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `integrations` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[external_id]` on the table `alerts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[case_id,alert_id]` on the table `case_alerts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[external_id]` on the table `cases` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[_id]` on the table `cases` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `external_id` to the `alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `alert_id` to the `case_alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `case_id` to the `case_alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `case_id` to the `case_comments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `_id` to the `cases` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ticket_id` to the `cases` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `integrations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."case_alerts" DROP CONSTRAINT "case_alerts_alertId_fkey";

-- DropForeignKey
ALTER TABLE "public"."case_alerts" DROP CONSTRAINT "case_alerts_caseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."case_comments" DROP CONSTRAINT "case_comments_caseId_fkey";

-- DropIndex
DROP INDEX "public"."alerts_externalId_key";

-- DropIndex
DROP INDEX "public"."case_alerts_caseId_alertId_key";

-- DropIndex
DROP INDEX "public"."cases_externalId_key";

-- AlterTable
ALTER TABLE "public"."alerts" DROP COLUMN "createdAt",
DROP COLUMN "externalId",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "external_id" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."case_alerts" DROP COLUMN "alertId",
DROP COLUMN "caseId",
ADD COLUMN     "alert_id" TEXT NOT NULL,
ADD COLUMN     "case_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."case_comments" DROP COLUMN "caseId",
DROP COLUMN "createdAt",
ADD COLUMN     "case_id" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."cases" DROP CONSTRAINT "cases_pkey",
DROP COLUMN "acknowledgedAt",
DROP COLUMN "assigneeName",
DROP COLUMN "closedAt",
DROP COLUMN "createdAt",
DROP COLUMN "createdBy",
DROP COLUMN "createdByName",
DROP COLUMN "custId",
DROP COLUMN "description",
DROP COLUMN "endTimestamp",
DROP COLUMN "externalId",
DROP COLUMN "id",
DROP COLUMN "metadata",
DROP COLUMN "modifiedBy",
DROP COLUMN "modifiedByName",
DROP COLUMN "mttd",
DROP COLUMN "startTimestamp",
DROP COLUMN "tenantName",
DROP COLUMN "ticketId",
DROP COLUMN "updatedAt",
ADD COLUMN     "_id" TEXT NOT NULL,
ADD COLUMN     "acknowledged" TIMESTAMP(3),
ADD COLUMN     "assignee_name" TEXT,
ADD COLUMN     "closed" TIMESTAMP(3),
ADD COLUMN     "created_at" TIMESTAMP(3),
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "created_by_name" TEXT,
ADD COLUMN     "cust_id" TEXT,
ADD COLUMN     "end_timestamp" TIMESTAMP(3),
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "modified_at" TIMESTAMP(3),
ADD COLUMN     "modified_by" TEXT,
ADD COLUMN     "modified_by_name" TEXT,
ADD COLUMN     "start_timestamp" TIMESTAMP(3),
ADD COLUMN     "tenant_name" TEXT,
ADD COLUMN     "ticket_id" INTEGER NOT NULL,
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "severity" DROP DEFAULT,
ADD CONSTRAINT "cases_pkey" PRIMARY KEY ("_id");

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

-- CreateIndex
CREATE UNIQUE INDEX "case_alerts_case_id_alert_id_key" ON "public"."case_alerts"("case_id", "alert_id");

-- CreateIndex
CREATE UNIQUE INDEX "cases_external_id_key" ON "public"."cases"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "cases__id_key" ON "public"."cases"("_id");

-- AddForeignKey
ALTER TABLE "public"."case_alerts" ADD CONSTRAINT "case_alerts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."case_alerts" ADD CONSTRAINT "case_alerts_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."case_comments" ADD CONSTRAINT "case_comments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("_id") ON DELETE CASCADE ON UPDATE CASCADE;
