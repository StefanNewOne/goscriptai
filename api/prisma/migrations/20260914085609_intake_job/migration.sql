-- CreateTable
CREATE TABLE "IntakeJob" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "webUrl" TEXT,
    "videosPath" TEXT,
    "graphicsPath" TEXT,
    "docsPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeJob_status_createdAt_idx" ON "IntakeJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "IntakeJob" ADD CONSTRAINT "IntakeJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
