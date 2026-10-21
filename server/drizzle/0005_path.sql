CREATE TABLE "path_progress" (
	"node_key" text PRIMARY KEY NOT NULL,
	"stars" smallint NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
