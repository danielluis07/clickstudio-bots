CREATE TABLE "sign_in_attempt" (
	"key" text PRIMARY KEY,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sign_in_attempt_window_started_at_idx" ON "sign_in_attempt" ("window_started_at");