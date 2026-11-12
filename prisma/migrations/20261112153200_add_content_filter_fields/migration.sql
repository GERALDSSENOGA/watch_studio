-- Migration: 20261112153200_add_content_filter_fields
-- Add content filtering / parental control fields to MediaItem.

ALTER TABLE "MediaItem" ADD COLUMN "contentFilterEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaItem" ADD COLUMN "contentRating" TEXT;
ALTER TABLE "MediaItem" ADD COLUMN "contentWarnings" TEXT;
ALTER TABLE "MediaItem" ADD COLUMN "skipSegments" TEXT;
