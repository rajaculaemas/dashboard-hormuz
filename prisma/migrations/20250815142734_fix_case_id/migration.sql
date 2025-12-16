/*
  Warnings:

  - The primary key for the `cases` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `_id` on the `cases` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id]` on the table `cases` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `cases` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropForeignKey
ALTER TABLE "public"."case_alerts" DROP CONSTRAINT "case_alerts_case_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."case_comments" DROP CONSTRAINT "case_comments_case_id_fkey";

-- DropIndex
DROP INDEX "public"."cases__id_key";

-- AlterTable
ALTER TABLE "public"."cases" DROP CONSTRAINT "cases_pkey",
DROP COLUMN "_id",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "cases_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "cases_id_key" ON "public"."cases"("id");

-- AddForeignKey
ALTER TABLE "public"."case_alerts" ADD CONSTRAINT "case_alerts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."case_comments" ADD CONSTRAINT "case_comments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
