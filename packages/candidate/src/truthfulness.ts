import type { CandidateFact } from "./types";

/**
 * Checks whether a candidate fact is strictly verified.
 */
export function isVerifiedFact<T>(fact: CandidateFact<T>): boolean {
  return fact.status === "VERIFIED";
}

/**
 * Checks whether a candidate fact requires user confirmation before use.
 * Any fact that is INFERRED or USER_REQUIRED must not be treated as a verified truth.
 */
export function requiresUserConfirmation<T>(fact: CandidateFact<T>): boolean {
  return fact.status === "USER_REQUIRED" || fact.status === "INFERRED";
}

/**
 * Helper to construct a VERIFIED candidate fact.
 */
export function createVerifiedFact<T>(value: T, source: string): CandidateFact<T> {
  return { value, status: "VERIFIED", source };
}

/**
 * Helper to construct an INFERRED candidate fact.
 */
export function createInferredFact<T>(value: T, source: string): CandidateFact<T> {
  return { value, status: "INFERRED", source };
}

/**
 * Helper to construct a USER_REQUIRED candidate fact.
 */
export function createRequiredFact<T>(value: T, source?: string): CandidateFact<T> {
  return { value, status: "USER_REQUIRED", source };
}
