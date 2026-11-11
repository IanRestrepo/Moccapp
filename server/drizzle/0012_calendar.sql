CREATE TABLE "calendar_feeds" (
	"profile" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text
);--> statement-breakpoint
CREATE TABLE "exam_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile" text NOT NULL,
	"uid" text NOT NULL,
	"origin" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources_locked" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"notified" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "exam_events_profile_uid_uq" ON "exam_events" USING btree ("profile","uid");--> statement-breakpoint
CREATE INDEX "exam_events_profile_start_idx" ON "exam_events" USING btree ("profile","starts_at");--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "daily_facts" boolean DEFAULT true NOT NULL;
