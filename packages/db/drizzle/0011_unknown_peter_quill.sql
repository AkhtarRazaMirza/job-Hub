CREATE TABLE "job_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"job_id" text NOT NULL,
	"overall_score" numeric(4, 2) NOT NULL,
	"decision" text NOT NULL,
	"hard_constraints_passed" boolean DEFAULT true NOT NULL,
	"hard_constraint_failures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category_scores" jsonb NOT NULL,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"explanation" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"weights_used" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_job_unique" UNIQUE("candidate_profile_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_candidate_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_matches_candidate_profile_id_idx" ON "job_matches" USING btree ("candidate_profile_id");--> statement-breakpoint
CREATE INDEX "job_matches_job_id_idx" ON "job_matches" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_matches_candidate_score_idx" ON "job_matches" USING btree ("candidate_profile_id","overall_score");--> statement-breakpoint
CREATE INDEX "job_matches_decision_idx" ON "job_matches" USING btree ("decision");