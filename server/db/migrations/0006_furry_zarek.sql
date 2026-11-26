ALTER TABLE "characters" ADD COLUMN "category" text DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "describe" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "first_sight" jsonb;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "history" jsonb;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "inhabitants" jsonb;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "access" jsonb;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "secrets" jsonb;--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN "category" text DEFAULT 'object' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "game_genre" text DEFAULT '' NOT NULL;