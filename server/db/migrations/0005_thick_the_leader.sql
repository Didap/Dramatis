ALTER TABLE "characters" ADD COLUMN "has_powers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "powers" jsonb DEFAULT '[]'::jsonb NOT NULL;