ALTER TABLE "exams" ADD COLUMN "source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "exams" SET "source_ids" = jsonb_build_array("source_id"::text) WHERE "source_ids" = '[]'::jsonb;
