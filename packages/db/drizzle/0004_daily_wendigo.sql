ALTER TABLE "resumes" ADD COLUMN "extracted_text" text;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "processing_error" text;