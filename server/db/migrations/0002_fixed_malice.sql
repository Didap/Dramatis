ALTER TABLE "groups" ADD COLUMN "describe" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "subraces" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "groups" g SET "describe" = 'guided' WHERE g."kind" = 'race' AND (g."language" IS NOT NULL OR g."traditions" IS NOT NULL OR g."powers" IS NOT NULL
  OR EXISTS (SELECT 1 FROM "images" i WHERE i."owner_type" = 'group' AND i."owner_id" = g."id")
  OR EXISTS (SELECT 1 FROM "relations" r WHERE r."kind" <> 'membership' AND ((r."source_type" = 'group' AND r."source_id" = g."id") OR (r."target_type" = 'group' AND r."target_id" = g."id")))
  OR EXISTS (SELECT 1 FROM "events" e WHERE e."refs" @> jsonb_build_array(jsonb_build_object('type', 'group', 'id', g."id"::text))));