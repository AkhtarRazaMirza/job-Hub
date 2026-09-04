CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_profile_id" text NOT NULL,
	"type" text NOT NULL,
	"target_key" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"explanation" text NOT NULL,
	"confidence" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"dismissed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_candidate_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendations_candidate_profile_id_idx" ON "recommendations" USING btree ("candidate_profile_id");--> statement-breakpoint
CREATE INDEX "recommendations_status_idx" ON "recommendations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recommendations_type_idx" ON "recommendations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "recommendations_candidate_target_idx" ON "recommendations" USING btree ("candidate_profile_id","target_key");--> statement-breakpoint
CREATE INDEX "recommendations_created_at_idx" ON "recommendations" USING btree ("created_at");