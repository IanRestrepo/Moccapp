CREATE TABLE "maintenance_notice" (
  "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "enabled" boolean NOT NULL DEFAULT true,
  "title" text NOT NULL,
  "message" text NOT NULL
);
--> statement-breakpoint
INSERT INTO "maintenance_notice" ("id", "enabled", "title", "message")
VALUES (1, true, 'Estamos en mantenimiento', 'Podrás estudiar, pero se pueden presentar fallas.');
