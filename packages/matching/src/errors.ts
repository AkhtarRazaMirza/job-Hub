/**
 * Job Hub — Phase 4 / Step 4.1
 * Matching Domain Errors
 */

export class JobMatchError extends Error {
  constructor(message: string, public readonly code = "JOB_MATCH_ERROR") {
    super(message);
    this.name = "JobMatchError";
  }
}

export class JobMatchNotFoundError extends JobMatchError {
  constructor(identifier: string) {
    super(`Job match "${identifier}" was not found.`, "JOB_MATCH_NOT_FOUND");
    this.name = "JobMatchNotFoundError";
  }
}

export class JobMatchConflictError extends JobMatchError {
  constructor(message: string) {
    super(message, "JOB_MATCH_CONFLICT");
    this.name = "JobMatchConflictError";
  }
}

export class JobMatchValidationError extends JobMatchError {
  constructor(message: string) {
    super(message, "JOB_MATCH_VALIDATION_ERROR");
    this.name = "JobMatchValidationError";
  }
}
