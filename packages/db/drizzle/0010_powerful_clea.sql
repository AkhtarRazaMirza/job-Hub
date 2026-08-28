CREATE TABLE "job_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_job_id" text,
	"job_source_id" text,
	"canonical_url" text,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"location" text,
	"remote_type" text DEFAULT 'UNKNOWN' NOT NULL,
	"allowed_countries" jsonb DEFAULT '[]'::jsonb,
	"salary" integer,
	"salary_min" integer,
	"salary_max" integer,
	"currency" text DEFAULT 'USD',
	"experience" text,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"requirements" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"application_url" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_job_source_id_job_sources_id_fk" FOREIGN KEY ("job_source_id") REFERENCES "public"."job_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_sources_is_active_idx" ON "job_sources" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "job_sources_type_idx" ON "job_sources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "jobs_source_source_job_id_idx" ON "jobs" USING btree ("source","source_job_id");--> statement-breakpoint
CREATE INDEX "jobs_canonical_url_idx" ON "jobs" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "jobs_remote_type_idx" ON "jobs" USING btree ("remote_type");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company");--> statement-breakpoint
CREATE INDEX "jobs_job_source_id_idx" ON "jobs" USING btree ("job_source_id");--> statement-breakpoint
CREATE INDEX "jobs_posted_at_idx" ON "jobs" USING btree ("posted_at");