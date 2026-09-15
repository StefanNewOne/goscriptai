-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "GlossaryTerm" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT true;
