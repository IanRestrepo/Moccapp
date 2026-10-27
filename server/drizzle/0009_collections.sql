CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile" text NOT NULL,
	"name" text NOT NULL,
	"color" "source_color" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "collection_sources" (
	"collection_id" uuid NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE,
	"source_id" uuid NOT NULL REFERENCES "sources"("id") ON DELETE CASCADE,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_sources_pk" PRIMARY KEY("collection_id","source_id")
);--> statement-breakpoint
CREATE INDEX "collections_profile_idx" ON "collections" USING btree ("profile");
