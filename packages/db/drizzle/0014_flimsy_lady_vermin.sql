CREATE TABLE "tailored_resumes" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"job_id" text NOT NULL,
	"source_resume_id" text NOT NULL,
	"target_title" text,
	"tailored_data" jsonb NOT NULL,
	"truthfulness_score" numeric(5, 2),
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tailored_resumes" ADD CONSTRAINT "tailored_resumes_candidate_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_resumes" ADD CONSTRAINT "tailored_resumes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_resumes" ADD CONSTRAINT "tailored_resumes_source_resume_id_resumes_id_fk" FOREIGN KEY ("source_resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tailored_resumes_candidate_profile_id_idx" ON "tailored_resumes" USING btree ("candidate_profile_id");--> statement-breakpoint
CREATE INDEX "tailored_resumes_job_id_idx" ON "tailored_resumes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "tailored_resumes_source_resume_id_idx" ON "tailored_resumes" USING btree ("source_resume_id");--> statement-breakpoint
CREATE INDEX "tailored_resumes_status_idx" ON "tailored_resumes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tailored_resumes_created_at_idx" ON "tailored_resumes" USING btree ("created_at");