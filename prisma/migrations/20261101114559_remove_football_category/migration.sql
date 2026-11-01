-- Migration: 20261101114559_remove_football_category
-- Remove FOOTBALL from MediaCategory enum; existing FOOTBALL records become MOVIE.

-- 1. Update any existing FOOTBALL records to MOVIE
UPDATE "MediaItem" SET "category" = 'MOVIE' WHERE "category" = 'FOOTBALL';

-- 2. Create new enum type without FOOTBALL
CREATE TYPE "MediaCategory_new" AS ENUM ('MOVIE');

-- 3. Alter the column to use the new type
ALTER TABLE "MediaItem" ALTER COLUMN "category" TYPE "MediaCategory_new" USING "category"::text::"MediaCategory_new";

-- 4. Drop the old enum type
DROP TYPE "MediaCategory";

-- 5. Rename the new type to the original name
ALTER TYPE "MediaCategory_new" RENAME TO "MediaCategory";
