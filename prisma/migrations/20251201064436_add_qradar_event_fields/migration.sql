-- AlterTable
ALTER TABLE "qradar_events" ADD COLUMN     "destination_port" INTEGER,
ADD COLUMN     "event_name" TEXT,
ADD COLUMN     "metadata" JSONB DEFAULT '{}',
ADD COLUMN     "severity" INTEGER,
ADD COLUMN     "source_port" INTEGER;
