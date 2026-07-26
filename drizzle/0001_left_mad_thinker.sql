CREATE TABLE "metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"box" text NOT NULL,
	"metric" text NOT NULL,
	"value" double precision NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_state" (
	"service" text PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_status" (
	"id" text PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"ok" boolean NOT NULL,
	"latency_ms" integer,
	"error" text,
	"polled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"polled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "metrics_box_metric_at_idx" ON "metrics" USING btree ("box","metric","at");--> statement-breakpoint
CREATE INDEX "service_status_service_polled_idx" ON "service_status" USING btree ("service","polled_at");--> statement-breakpoint
CREATE INDEX "snapshots_service_kind_polled_idx" ON "snapshots" USING btree ("service","kind","polled_at");