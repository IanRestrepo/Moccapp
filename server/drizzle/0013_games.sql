CREATE TABLE "word_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile" text NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"pack_granted" boolean DEFAULT false NOT NULL
);--> statement-breakpoint
CREATE TABLE "mocca_cards" (
	"profile" text NOT NULL,
	"mood" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mocca_cards_profile_mood_pk" PRIMARY KEY("profile","mood")
);--> statement-breakpoint
ALTER TABLE "word_games" ADD CONSTRAINT "word_games_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "word_games_profile_idx" ON "word_games" USING btree ("profile","completed_at");--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "packs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "packs_opened" integer DEFAULT 0 NOT NULL;
