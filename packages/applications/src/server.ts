/**
 * Server-only exports for @job-hub/applications
 * Contains Drizzle repository instances and database access.
 */

import { DrizzleApplicationRepository, type ApplicationRepository } from "./repository";

export * from "./index";
export * from "./repository";

export const applicationRepository: ApplicationRepository =
  new DrizzleApplicationRepository();
