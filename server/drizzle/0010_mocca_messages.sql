CREATE TABLE "mocca_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile" text NOT NULL,
	"text" text NOT NULL,
	"mood" text DEFAULT 'happy' NOT NULL,
	"push" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"seen_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX "mocca_messages_profile_idx" ON "mocca_messages" USING btree ("profile","seen_at");
