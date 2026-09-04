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
export * from "./browser/server";
export * from "./analytics/repository";
export * from "./analytics/service";

export const applicationRepository: ApplicationRepository =
  new DrizzleApplicationRepository();

export * from "./learning/repository";
export * from "./learning/analyzer";
export * from "./learning/pattern-detector";
export * from "./learning/recommendation-agent";

import { LearningRepository } from "./learning/repository";
import { OutcomeAnalyzer } from "./learning/analyzer";
import { PatternDetector } from "./learning/pattern-detector";
import { RecommendationAgent } from "./learning/recommendation-agent";

export const learningRepository = new LearningRepository();
export const outcomeAnalyzer = new OutcomeAnalyzer();
export const patternDetector = new PatternDetector();
export const recommendationAgent = new RecommendationAgent();
