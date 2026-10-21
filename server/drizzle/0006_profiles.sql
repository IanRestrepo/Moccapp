ALTER TABLE "user_stats" DROP CONSTRAINT IF EXISTS "single_row";--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "owner" text DEFAULT 'ash' NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "profile" text DEFAULT 'ash' NOT NULL;--> statement-breakpoint
ALTER TABLE "path_progress" ADD COLUMN "profile" text DEFAULT 'ash' NOT NULL;--> statement-breakpoint
ALTER TABLE "path_progress" DROP CONSTRAINT "path_progress_pkey";--> statement-breakpoint
ALTER TABLE "path_progress" ADD CONSTRAINT "path_progress_profile_node_key_pk" PRIMARY KEY("profile","node_key");--> statement-breakpoint
CREATE INDEX "exams_profile_idx" ON "exams" USING btree ("profile","created_at");
