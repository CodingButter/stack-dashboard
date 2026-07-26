CREATE TYPE "public"."alert_severity" AS ENUM('critical', 'warning', 'info');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"target" text NOT NULL,
	"message" text NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"acked" boolean DEFAULT false NOT NULL,
	"acked_by" text
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acked_by_users_id_fk" FOREIGN KEY ("acked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_rule_target_idx" ON "alerts" USING btree ("rule_id","target");--> statement-breakpoint
CREATE INDEX "alerts_resolved_last_seen_idx" ON "alerts" USING btree ("resolved_at","last_seen");