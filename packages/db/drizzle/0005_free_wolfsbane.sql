ALTER TABLE "candidate_profiles" ADD COLUMN "headline" text;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "profile_data" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "source_resume_id" text;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "profiled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_source_resume_id_resumes_id_fk" FOREIGN KEY ("source_resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;