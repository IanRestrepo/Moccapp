ALTER TABLE "user_stats" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "last_seen_view" text;--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "last_seen_device" text;
