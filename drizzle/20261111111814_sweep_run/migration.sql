CREATE TABLE "sweep_run" (
	"id" text PRIMARY KEY DEFAULT 'sweep',
	"finished_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sweep_run_single_row" CHECK ("id" = 'sweep')
);
