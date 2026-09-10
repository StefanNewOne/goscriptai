-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('MK', 'SQ', 'BOTH');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SCRIPTWRITER', 'ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('DRAFT', 'INTAKE', 'ANALYST_RUNNING', 'ANALYST_QUESTIONS', 'ANALYST_REVIEW', 'AVATARS_RUNNING', 'AVATARS_REVIEW', 'MANUAL_SETUP', 'ACTIVE');

-- CreateEnum
CREATE TYPE "SetStatus" AS ENUM ('DRAFT', 'BRIEF_SUBMITTED', 'CONCEPTS_GENERATING', 'CONCEPTS_REVIEW', 'SCRIPTS_WRITING', 'CRITIC_RUNNING', 'AUTO_REVISION', 'SCRIPTS_REVIEW', 'REVISION', 'APPROVED', 'EXPORTED', 'LINKED_TO_ADS', 'LEARNED', 'ARCHIVED', 'PAUSED', 'FAILED', 'BUDGET_HOLD');

-- CreateEnum
CREATE TYPE "ScriptType" AS ENUM ('PRODUCT_OFFER', 'EDUCATIONAL', 'TESTIMONIAL', 'SKETCH');

-- CreateEnum
CREATE TYPE "ScriptStatus" AS ENUM ('DRAFT', 'WRITING', 'CRITIC_RUNNING', 'CRITIC_FAILED', 'SCRIPTS_REVIEW', 'APPROVED', 'EXPORTED', 'LIVE', 'LEARNED');

-- CreateEnum
CREATE TYPE "AvatarStatus" AS ENUM ('PENDING_CONFIRMATION', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ConceptDecision" AS ENUM ('PENDING', 'SELECTED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SCRIPTWRITER',
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyTelegram" BOOLEAN NOT NULL DEFAULT false,
    "telegramChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "industry" TEXT,
    "language" "Language" NOT NULL DEFAULT 'MK',
    "status" "ClientStatus" NOT NULL DEFAULT 'DRAFT',
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "reelsPerMonth" INTEGER,
    "graphicsPerMonth" INTEGER,
    "metaAdAccountIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "budgetUsd" DECIMAL(10,2) NOT NULL DEFAULT 50,
    "spentUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "markdown" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "profile" JSONB NOT NULL,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AvatarStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Actor" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "languages" "Language"[] DEFAULT ARRAY[]::"Language"[],
    "style" TEXT,
    "canDo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cannotDo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "photoUrl" TEXT,

    CONSTRAINT "Actor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "usableElements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "constraints" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "price" DECIMAL(10,2),
    "installment" DECIMAL(10,2),
    "usp" TEXT,
    "seasonality" TEXT,
    "promoFrom" TIMESTAMP(3),
    "promoTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "links" JSONB NOT NULL,
    "why" TEXT,
    "doNotCopy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "profiles" JSONB,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendReference" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "url" TEXT,
    "platform" TEXT,
    "transcript" TEXT,
    "analysis" TEXT,
    "flag" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlossaryTerm" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "term" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "GlossaryTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "industry" TEXT,
    "text" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrainChange" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrainChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptSet" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "writerUserId" TEXT NOT NULL,
    "status" "SetStatus" NOT NULL DEFAULT 'DRAFT',
    "yymm" TEXT NOT NULL,
    "brief" JSONB NOT NULL,
    "requested" INTEGER NOT NULL DEFAULT 1,
    "budgetUsd" DECIMAL(10,2) NOT NULL DEFAULT 8,
    "spentUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "prevStatus" "SetStatus",
    "exportPath" TEXT,
    "exportMdPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScriptSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "type" "ScriptType" NOT NULL,
    "avatarId" TEXT,
    "actorId" TEXT,
    "locationId" TEXT,
    "card" JSONB NOT NULL,
    "decision" "ConceptDecision" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "setId" TEXT,
    "conceptId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ScriptType" NOT NULL,
    "language" "Language" NOT NULL,
    "avatarId" TEXT,
    "actorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locationId" TEXT,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "markdown" TEXT NOT NULL,
    "status" "ScriptStatus" NOT NULL DEFAULT 'DRAFT',
    "criticReport" JSONB,
    "revisionRound" INTEGER NOT NULL DEFAULT 0,
    "isStarExample" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'GENERATED',
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptVersion" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "markdown" TEXT NOT NULL,
    "authoredBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCreative" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT,
    "metaAdId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adName" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "mappingStatus" TEXT NOT NULL DEFAULT 'PENDING_MAPPING',

    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdMetrics" (
    "id" TEXT NOT NULL,
    "adCreativeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "results" INTEGER NOT NULL DEFAULT 0,
    "costPerResult" DECIMAL(10,4),
    "hookRate" DECIMAL(6,4),
    "holdRate" DECIMAL(6,4),
    "ctr" DECIMAL(6,4),
    "percentile" INTEGER,

    CONSTRAINT "AdMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "setId" TEXT,
    "clientId" TEXT NOT NULL,
    "agentKind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "sessionId" TEXT,
    "costUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "setId" TEXT,
    "clientId" TEXT NOT NULL,
    "checkpoint" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "setId" TEXT,
    "agentKind" TEXT NOT NULL,
    "model" TEXT,
    "usd" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "language" "Language",
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "link" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "ClientProfile_clientId_idx" ON "ClientProfile"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_clientId_version_key" ON "ClientProfile"("clientId", "version");

-- CreateIndex
CREATE INDEX "Avatar_clientId_status_idx" ON "Avatar"("clientId", "status");

-- CreateIndex
CREATE INDEX "Actor_clientId_idx" ON "Actor"("clientId");

-- CreateIndex
CREATE INDEX "Location_clientId_idx" ON "Location"("clientId");

-- CreateIndex
CREATE INDEX "Product_clientId_idx" ON "Product"("clientId");

-- CreateIndex
CREATE INDEX "Competitor_clientId_status_idx" ON "Competitor"("clientId", "status");

-- CreateIndex
CREATE INDEX "TrendReference_clientId_idx" ON "TrendReference"("clientId");

-- CreateIndex
CREATE INDEX "GlossaryTerm_clientId_language_idx" ON "GlossaryTerm"("clientId", "language");

-- CreateIndex
CREATE INDEX "Insight_clientId_idx" ON "Insight"("clientId");

-- CreateIndex
CREATE INDEX "BrainChange_clientId_createdAt_idx" ON "BrainChange"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ScriptSet_clientId_status_idx" ON "ScriptSet"("clientId", "status");

-- CreateIndex
CREATE INDEX "ScriptSet_writerUserId_status_idx" ON "ScriptSet"("writerUserId", "status");

-- CreateIndex
CREATE INDEX "Concept_setId_idx" ON "Concept"("setId");

-- CreateIndex
CREATE UNIQUE INDEX "Script_code_key" ON "Script"("code");

-- CreateIndex
CREATE INDEX "Script_clientId_type_status_idx" ON "Script"("clientId", "type", "status");

-- CreateIndex
CREATE INDEX "Script_setId_idx" ON "Script"("setId");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptVersion_scriptId_version_key" ON "ScriptVersion"("scriptId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AdCreative_metaAdId_key" ON "AdCreative"("metaAdId");

-- CreateIndex
CREATE INDEX "AdMetrics_adCreativeId_date_idx" ON "AdMetrics"("adCreativeId", "date");

-- CreateIndex
CREATE INDEX "AgentRun_setId_idx" ON "AgentRun"("setId");

-- CreateIndex
CREATE INDEX "AgentRun_clientId_idx" ON "AgentRun"("clientId");

-- CreateIndex
CREATE INDEX "Message_runId_createdAt_idx" ON "Message"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "Approval_setId_idx" ON "Approval"("setId");

-- CreateIndex
CREATE INDEX "Approval_clientId_idx" ON "Approval"("clientId");

-- CreateIndex
CREATE INDEX "CostEntry_clientId_setId_idx" ON "CostEntry"("clientId", "setId");

-- CreateIndex
CREATE INDEX "Template_kind_active_idx" ON "Template"("kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Template_kind_language_version_key" ON "Template"("kind", "language", "version");

-- AddForeignKey
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actor" ADD CONSTRAINT "Actor_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendReference" ADD CONSTRAINT "TrendReference_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryTerm" ADD CONSTRAINT "GlossaryTerm_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrainChange" ADD CONSTRAINT "BrainChange_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptSet" ADD CONSTRAINT "ScriptSet_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptSet" ADD CONSTRAINT "ScriptSet_writerUserId_fkey" FOREIGN KEY ("writerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_setId_fkey" FOREIGN KEY ("setId") REFERENCES "ScriptSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_setId_fkey" FOREIGN KEY ("setId") REFERENCES "ScriptSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptVersion" ADD CONSTRAINT "ScriptVersion_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdMetrics" ADD CONSTRAINT "AdMetrics_adCreativeId_fkey" FOREIGN KEY ("adCreativeId") REFERENCES "AdCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_setId_fkey" FOREIGN KEY ("setId") REFERENCES "ScriptSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_setId_fkey" FOREIGN KEY ("setId") REFERENCES "ScriptSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_setId_fkey" FOREIGN KEY ("setId") REFERENCES "ScriptSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
