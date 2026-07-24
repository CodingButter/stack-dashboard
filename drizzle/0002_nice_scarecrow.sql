CREATE TYPE "public"."log_source" AS ENUM('journal', 'docker', 'auth', 'kernel', 'app');--> statement-breakpoint
CREATE TABLE "log_cursors" (
	"id" text PRIMARY KEY NOT NULL,
	"box" text NOT NULL,
	"source" "log_source" NOT NULL,
	"unit" text NOT NULL,
	"cursor" text,
	"since_unix" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"box" text NOT NULL,
	"source" "log_source" NOT NULL,
	"unit" text NOT NULL,
	"severity" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE INDEX "log_lines_box_source_ts_idx" ON "log_lines" USING btree ("box","source","ts");--> statement-breakpoint
CREATE INDEX "log_lines_unit_ts_idx" ON "log_lines" USING btree ("unit","ts");