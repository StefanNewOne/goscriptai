-- Voyage AI embeddings are 1024-dim; resize the pgvector columns (no data yet).
ALTER TABLE "Script" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "Script" ADD COLUMN "embedding" vector(1024);
ALTER TABLE "TrendReference" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "TrendReference" ADD COLUMN "embedding" vector(1024);
