CREATE TABLE "candidate_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"remote_preference" text DEFAULT 'UNKNOWN' NOT NULL,
	"preferred_locations" jsonb DEFAULT '[]'::jsonb,
	"salary_min" integer,
	"salary_currency" text DEFAULT 'USD',
	"target_roles" jsonb DEFAULT '[]'::jsonb,
	"experience_level" text DEFAULT 'MID',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_preferences_candidate_profile_id_unique" UNIQUE("candidate_profile_id")
);
--> statement-breakpoint
ALTER TABLE "candidate_preferences" ADD CONSTRAINT "candidate_preferences_candidate_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_preferences_profile_id_idx" ON "candidate_preferences" USING btree ("candidate_profile_id");