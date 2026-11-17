CREATE TABLE guide_exposure (
  profile text NOT NULL,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  guide_hash text NOT NULL,
  question_key text NOT NULL,
  concepts jsonb NOT NULL,
  times_seen integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile, source_id, guide_hash, question_key)
);
--> statement-breakpoint
ALTER TABLE exams ADD COLUMN complete_guide boolean NOT NULL DEFAULT false;
