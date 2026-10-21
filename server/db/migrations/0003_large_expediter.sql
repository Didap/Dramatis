ALTER TABLE "relations" ALTER COLUMN "intensity" SET DEFAULT 5;--> statement-breakpoint
ALTER TABLE "relations" ALTER COLUMN "reverse_intensity" SET DEFAULT 5;--> statement-breakpoint
UPDATE "relations" SET "intensity" = CASE "intensity" WHEN 1 THEN 3 WHEN 3 THEN 8 ELSE 5 END, "reverse_intensity" = CASE "reverse_intensity" WHEN 1 THEN 3 WHEN 3 THEN 8 ELSE 5 END;--> statement-breakpoint
UPDATE "relations" SET "evolution" = (
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(e.step->'intensity') = 'number'
    THEN jsonb_set(e.step, '{intensity}', to_jsonb(CASE (e.step->>'intensity')::int WHEN 1 THEN 3 WHEN 3 THEN 8 ELSE 5 END))
    ELSE e.step END ORDER BY e.n)
  FROM jsonb_array_elements("evolution") WITH ORDINALITY AS e(step, n)
) WHERE jsonb_typeof("evolution") = 'array' AND "evolution" <> '[]'::jsonb;
