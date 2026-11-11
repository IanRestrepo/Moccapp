CREATE TABLE "study_guides" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"data" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "study_guides" ADD CONSTRAINT "study_guides_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
