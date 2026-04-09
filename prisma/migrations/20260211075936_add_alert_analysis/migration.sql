-- CreateTable
CREATE TABLE "alert_analysis" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_analysis_alert_id_idx" ON "alert_analysis"("alert_id");

-- CreateIndex
CREATE INDEX "alert_analysis_integration_id_idx" ON "alert_analysis"("integration_id");

-- AddForeignKey
ALTER TABLE "alert_analysis" ADD CONSTRAINT "alert_analysis_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
