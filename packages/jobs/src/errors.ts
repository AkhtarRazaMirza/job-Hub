/**
 * Domain errors for Jobs and Job Sources subsystem.
 */

export class JobError extends Error {
  constructor(message: string, public readonly code = "JOB_ERROR") {
    super(message);
    this.name = "JobError";
  }
}

export class JobNotFoundError extends JobError {
  constructor(message = "Job not found.") {
    super(message, "JOB_NOT_FOUND");
    this.name = "JobNotFoundError";
  }
}

export class JobValidationError extends JobError {
  constructor(message: string) {
    super(message, "JOB_VALIDATION_ERROR");
    this.name = "JobValidationError";
  }
}

export class JobConflictError extends JobError {
  constructor(message = "A duplicate job already exists.") {
    super(message, "JOB_CONFLICT");
    this.name = "JobConflictError";
  }
}

export class JobSourceNotFoundError extends JobError {
  constructor(message = "Job source not found.") {
    super(message, "JOB_SOURCE_NOT_FOUND");
    this.name = "JobSourceNotFoundError";
  }
}

export class JobSourceValidationError extends JobError {
  constructor(message: string) {
    super(message, "JOB_SOURCE_VALIDATION_ERROR");
    this.name = "JobSourceValidationError";
  }
}

export class JobSourceConflictError extends JobError {
  constructor(message = "A job source with this name already exists.") {
    super(message, "JOB_SOURCE_CONFLICT");
    this.name = "JobSourceConflictError";
  }
}
