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
