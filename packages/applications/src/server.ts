/**
 * Server-only exports for @job-hub/applications
 * Contains Drizzle repository instances and database access.
 */

import { DrizzleApplicationRepository, type ApplicationRepository } from "./repository";

export * from "./index";
export * from "./repository";
export * from "./tailoring/tailored-resume-repository";
export * from "./tailoring/resume-tailor";

export const applicationRepository: ApplicationRepository =
  new DrizzleApplicationRepository();
