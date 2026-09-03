CREATE TABLE "cover_letters" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"job_id" text NOT NULL,
	"title" text NOT NULL,
	"salutation" text NOT NULL,
	"hook" text NOT NULL,
	"body_paragraphs" jsonb NOT NULL,
	"call_to_action" text NOT NULL,
	"signoff" text NOT NULL,
	"content" text NOT NULL,
	"highlighted_skills" jsonb DEFAULT '[]'::jsonb,
	"highlighted_projects" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_candidate_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cover_letters_candidate_profile_id_idx" ON "cover_letters" USING btree ("candidate_profile_id");--> statement-breakpoint
CREATE INDEX "cover_letters_job_id_idx" ON "cover_letters" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "cover_letters_status_idx" ON "cover_letters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cover_letters_created_at_idx" ON "cover_letters" USING btree ("created_at");