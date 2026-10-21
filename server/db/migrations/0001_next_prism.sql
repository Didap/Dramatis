ALTER TABLE "relations" ADD COLUMN "reverse_intensity" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "relations" ADD COLUMN "evolution" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "relations" SET "reverse_intensity" = "intensity";