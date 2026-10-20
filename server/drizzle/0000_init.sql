CREATE TYPE "public"."exam_level" AS ENUM('easy', 'medium', 'hard', 'utp');--> statement-breakpoint
CREATE TYPE "public"."exam_mode" AS ENUM('normal', 'retry_failed');--> statement-breakpoint
CREATE TYPE "public"."exam_status" AS ENUM('in_progress', 'grading', 'completed');--> statement-breakpoint
CREATE TYPE "public"."graded_by" AS ENUM('auto', 'ai');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('multiple_choice', 'true_false', 'matching', 'short_answer');--> statement-breakpoint
CREATE TYPE "public"."source_color" AS ENUM('orange', 'yellow', 'lilac', 'pink', 'mint', 'sky');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('file', 'text', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('processing', 'ready', 'error');--> statement-breakpoint
CREATE TABLE "exam_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"display_order" jsonb,
	"answer" jsonb,
	"answered_at" timestamp with time zone,
	"time_spent_sec" integer,
	"credit" real,
	"graded_by" "graded_by",
	"feedback" text
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"mode" "exam_mode" DEFAULT 'normal' NOT NULL,
	"parent_exam_id" uuid,
	"level" "exam_level" NOT NULL,
	"question_types" jsonb NOT NULL,
	"question_count" smallint NOT NULL,
	"time_limit_sec" integer NOT NULL,
	"status" "exam_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"time_used_sec" integer,
	"auto_submitted" boolean DEFAULT false NOT NULL,
	"percent" real,
	"score" real,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"difficulty" smallint NOT NULL,
	"topic" text NOT NULL,
	"prompt" text NOT NULL,
	"data" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"source_quote" text NOT NULL,
	"source_location" text,
	"generation_batch" smallint DEFAULT 0 NOT NULL,
	"prompt_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "difficulty_range" CHECK ("question_bank"."difficulty" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"title_locked" boolean DEFAULT false NOT NULL,
	"kind" "source_kind" NOT NULL,
	"color" "source_color" NOT NULL,
	"status" "source_status" DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"content_hash" text NOT NULL,
	"original_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"storage_key" text,
	"thumbnail_url" text,
	"extracted_text" text,
	"youtube_url" text,
	"youtube_video_id" text,
	"gemini_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"display_name" text DEFAULT 'Doc' NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"active_dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exams_completed" integer DEFAULT 0 NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "single_row" CHECK ("user_stats"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_question_id_question_bank_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question_bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_parent_exam_id_exams_id_fk" FOREIGN KEY ("parent_exam_id") REFERENCES "public"."exams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_answers_exam_question_uq" ON "exam_answers" USING btree ("exam_id","question_id");--> statement-breakpoint
CREATE INDEX "exam_answers_question_idx" ON "exam_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "exams_source_idx" ON "exams" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE INDEX "exams_created_idx" ON "exams" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "question_bank_source_idx" ON "question_bank" USING btree ("source_id","difficulty","type");--> statement-breakpoint
CREATE UNIQUE INDEX "question_bank_source_prompt_uq" ON "question_bank" USING btree ("source_id","prompt_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_content_hash_uq" ON "sources" USING btree ("content_hash");