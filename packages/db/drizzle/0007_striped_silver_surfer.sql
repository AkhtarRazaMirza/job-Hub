CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"url" text,
	"repository_url" text,
	"primary_language" text,
	"languages" jsonb DEFAULT '[]'::jsonb,
	"technologies" jsonb DEFAULT '[]'::jsonb,
	"architecture_evidence" text,
	"quality_notes" text,
	"source" text DEFAULT 'GITHUB' NOT NULL,
	"verification_status" text DEFAULT 'VERIFIED' NOT NULL,
	"confirmed_by_user" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_candidate_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_candidate_profile_id_idx" ON "projects" USING btree ("candidate_profile_id");--> statement-breakpoint
CREATE INDEX "projects_verification_status_idx" ON "projects" USING btree ("verification_status");