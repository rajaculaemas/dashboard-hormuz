/*
  Warnings:

  - You are about to drop the column `integrationId` on the `alerts` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `case_comments` table. All the data in the column will be lost.
  - You are about to drop the column `integrationId` on the `cases` table. All the data in the column will be lost.
  - You are about to drop the column `last_sync` on the `integrations` table. All the data in the column will be lost.
  - Added the required column `integration_id` to the `alerts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integration_id` to the `cases` table without a default value. This is not possible if the table is not empty.
  - Made the column `score` on table `cases` required. This step will fail if there are existing NULL values in that column.
  - Made the column `size` on table `cases` required. This step will fail if there are existing NULL values in that column.
  - Made the column `version` on table `cases` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_by` on table `cases` required. This step will fail if there are existing NULL values in that column.
  - Made the column `cust_id` on table `cases` required. This step will fail if there are existing NULL values in that column.
  - Made the column `end_timestamp` on table `cases` required. This step will fail if there are existing NULL values in that column.
  - Made the column `modified_by` on table `cases` required. This step will fail if there are existing NULL values in that column.
  - Made the column `start_timestamp` on table `cases` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."alerts" DROP CONSTRAINT "alerts_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."cases" DROP CONSTRAINT "cases_integrationId_fkey";

-- AlterTable
ALTER TABLE "public"."alerts" DROP COLUMN "integrationId",
ADD COLUMN     "index" INTEGER,
ADD COLUMN     "integration_id" TEXT NOT NULL,
ADD COLUMN     "score" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT,
ALTER COLUMN "timestamp" DROP DEFAULT,
ALTER COLUMN "external_id" DROP NOT NULL,
ALTER COLUMN "updated_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."case_comments" DROP COLUMN "created_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."cases" DROP COLUMN "integrationId",
ADD COLUMN     "integration_id" TEXT NOT NULL,
ALTER COLUMN "score" SET NOT NULL,
ALTER COLUMN "size" SET NOT NULL,
ALTER COLUMN "version" SET NOT NULL,
ALTER COLUMN "created_at" DROP DEFAULT,
ALTER COLUMN "created_by" SET NOT NULL,
ALTER COLUMN "cust_id" SET NOT NULL,
ALTER COLUMN "end_timestamp" SET NOT NULL,
ALTER COLUMN "modified_by" SET NOT NULL,
ALTER COLUMN "start_timestamp" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."integrations" DROP COLUMN "last_sync",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "last_sync_at" TIMESTAMP(3),
ADD COLUMN     "method" TEXT,
ADD COLUMN     "type" TEXT,
ALTER COLUMN "status" SET DEFAULT 'disconnected',
ALTER COLUMN "updated_at" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."alert_comments" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_comments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."alerts" ADD CONSTRAINT "alerts_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cases" ADD CONSTRAINT "cases_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alert_comments" ADD CONSTRAINT "alert_comments_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "public"."alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
