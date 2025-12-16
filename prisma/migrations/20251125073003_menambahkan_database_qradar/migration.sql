-- CreateTable
CREATE TABLE "qradar_offenses" (
    "id" TEXT NOT NULL,
    "external_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "offense_type" TEXT,
    "event_count" INTEGER,
    "last_updated_time" TIMESTAMP(3),
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMP(3),
    "source_ips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "destination_ips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB DEFAULT '{}',
    "integrationId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qradar_offenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qradar_events" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "offense_id" INTEGER NOT NULL,
    "event_type" TEXT,
    "source_ip" TEXT,
    "destination_ip" TEXT,
    "protocol" TEXT,
    "event_timestamp" TIMESTAMP(3) NOT NULL,
    "payload" JSONB DEFAULT '{}',
    "qradar_offense_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qradar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qradar_tickets" (
    "id" TEXT NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "offense_id" INTEGER NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "qradar_offense_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qradar_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qradar_offenses_external_id_key" ON "qradar_offenses"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "qradar_events_external_id_key" ON "qradar_events"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "qradar_tickets_ticket_number_key" ON "qradar_tickets"("ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "qradar_tickets_offense_id_key" ON "qradar_tickets"("offense_id");

-- CreateIndex
CREATE UNIQUE INDEX "qradar_tickets_qradar_offense_id_key" ON "qradar_tickets"("qradar_offense_id");

-- AddForeignKey
ALTER TABLE "qradar_offenses" ADD CONSTRAINT "qradar_offenses_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qradar_events" ADD CONSTRAINT "qradar_events_qradar_offense_id_fkey" FOREIGN KEY ("qradar_offense_id") REFERENCES "qradar_offenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qradar_tickets" ADD CONSTRAINT "qradar_tickets_qradar_offense_id_fkey" FOREIGN KEY ("qradar_offense_id") REFERENCES "qradar_offenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
