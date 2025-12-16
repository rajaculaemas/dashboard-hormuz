/*
  Warnings:

  - Added the required column `metadata` to the `cases` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."cases" ADD COLUMN     "metadata" JSONB NOT NULL;
