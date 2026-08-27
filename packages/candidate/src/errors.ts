/**
 * Domain errors for candidate profile operations.
 */

export class CandidateProfileNotFoundError extends Error {
  constructor(message = "Candidate profile not found") {
    super(message);
    this.name = "CandidateProfileNotFoundError";
  }
}

export class CandidateProfileConflictError extends Error {
  constructor(message = "Candidate profile already exists for this user") {
    super(message);
    this.name = "CandidateProfileConflictError";
  }
}

export class CandidateProfileValidationError extends Error {
  constructor(message = "Candidate profile validation error") {
    super(message);
    this.name = "CandidateProfileValidationError";
  }
}

export class ResumeNotFoundError extends Error {
  constructor(message = "Resume not found") {
    super(message);
    this.name = "ResumeNotFoundError";
  }
}

export class ResumeForbiddenError extends Error {
  constructor(message = "You do not have permission to access this resume") {
    super(message);
    this.name = "ResumeForbiddenError";
  }
}
