-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "captions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "hookVariants" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "music" TEXT,
ADD COLUMN     "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "productionNote" TEXT,
ADD COLUMN     "vibe" TEXT;
