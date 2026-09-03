/**
 * Server-only exports for @job-hub/applications
 * Contains Drizzle repository instances and database access.
 */

import { DrizzleApplicationRepository, type ApplicationRepository } from "./repository";

export * from "./index";
export * from "./repository";
export * from "./tailoring/tailored-resume-repository";
export * from "./tailoring/resume-tailor";
export * from "./tailoring/document-service";
export * from "./cover-letter/cover-letter-writer";
export * from "./cover-letter/cover-letter-repository";
export * from "./answers/application-answerer";
export * from "./answers/answers-repository";
export * from "./orchestrator/preparation-service";

export const applicationRepository: ApplicationRepository =
  new DrizzleApplicationRepository();
