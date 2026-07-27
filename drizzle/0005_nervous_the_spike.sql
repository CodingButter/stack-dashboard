CREATE TYPE "public"."metric_resolution" AS ENUM('raw', 'hour', 'day');--> statement-breakpoint
ALTER TABLE "metrics" ADD COLUMN "resolution" "metric_resolution" DEFAULT 'raw' NOT NULL;--> statement-breakpoint
CREATE INDEX "metrics_resolution_at_idx" ON "metrics" USING btree ("resolution","at");