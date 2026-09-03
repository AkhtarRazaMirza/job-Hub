CREATE TABLE "application_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"confidence" text DEFAULT 'USER_REQUIRED' NOT NULL,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"document_type" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"event_type" text DEFAULT 'STATUS_CHANGE' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"job_id" text NOT NULL,
	"match_id" text,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"source" text NOT NULL,
	"application_url" text,
	"match_score" numeric(4, 2),
	"status" text DEFAULT 'PREPARED' NOT NULL,
	"submitted_at" timestamp with time zone,
	"next_action" text,
	"follow_up_date" timestamp with time zone,
	"notes" text,
	"resume_version_id" text,
	"cover_letter_version_id" text,
	"confirmation_reference" text,
	"answers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_candidate_profile_id_job_id_unique" UNIQUE("candidate_profile_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_match_id_job_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."job_matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_version_id_resumes_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_answers_application_id_idx" ON "application_answers" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "application_documents_application_id_idx" ON "application_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "application_documents_type_idx" ON "application_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "application_events_application_id_idx" ON "application_events" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "application_events_to_status_idx" ON "application_events" USING btree ("to_status");--> statement-breakpoint
CREATE INDEX "application_events_created_at_idx" ON "application_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "applications_candidate_profile_id_idx" ON "applications" USING btree ("candidate_profile_id");--> statement-breakpoint
CREATE INDEX "applications_job_id_idx" ON "applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "applications_match_id_idx" ON "applications" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_follow_up_date_idx" ON "applications" USING btree ("follow_up_date");--> statement-breakpoint
CREATE INDEX "applications_created_at_idx" ON "applications" USING btree ("created_at");