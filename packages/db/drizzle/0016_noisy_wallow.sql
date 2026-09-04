CREATE TABLE "browser_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"target_url" text NOT NULL,
	"detected_domain" text,
	"status" text DEFAULT 'INITIALIZING' NOT NULL,
	"form_detected" boolean DEFAULT false NOT NULL,
	"mapped_fields" jsonb DEFAULT '[]'::jsonb,
	"uploaded_documents" jsonb DEFAULT '[]'::jsonb,
	"safety_stop_reason" text,
	"safety_details" jsonb,
	"user_approved" boolean DEFAULT false NOT NULL,
	"user_approved_at" timestamp with time zone,
	"submission_verified" boolean DEFAULT false NOT NULL,
	"confirmation_reference" text,
	"error_message" text,
	"audit_log" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "browser_executions" ADD CONSTRAINT "browser_executions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_executions" ADD CONSTRAINT "browser_executions_candidate_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "browser_executions_application_id_idx" ON "browser_executions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "browser_executions_candidate_profile_id_idx" ON "browser_executions" USING btree ("candidate_profile_id");--> statement-breakpoint
CREATE INDEX "browser_executions_status_idx" ON "browser_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "browser_executions_created_at_idx" ON "browser_executions" USING btree ("created_at");