/**
 * Job Hub — Phase 6 / Step 6.2
 * Application Domain Custom Errors
 */

export class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationError";
  }
}

export class ApplicationNotFoundError extends ApplicationError {
  constructor(identifier: string) {
    super(`Application not found: ${identifier}`);
    this.name = "ApplicationNotFoundError";
  }
}

export class ApplicationConflictError extends ApplicationError {
  readonly candidateProfileId: string;
  readonly jobId: string;

  constructor(candidateProfileId: string, jobId: string) {
    super(
      `An application already exists for candidate profile ${candidateProfileId} and job ${jobId}`
    );
    this.name = "ApplicationConflictError";
    this.candidateProfileId = candidateProfileId;
    this.jobId = jobId;
  }
}

export class InvalidStateTransitionError extends ApplicationError {
  readonly fromStatus: string;
  readonly toStatus: string;

  constructor(fromStatus: string, toStatus: string, reason?: string) {
    const detail = reason ? ` (${reason})` : "";
    super(
      `Invalid application status transition from '${fromStatus}' to '${toStatus}'${detail}`
    );
    this.name = "InvalidStateTransitionError";
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

export class ApplicationForbiddenError extends ApplicationError {
  constructor(message = "You do not have permission to access or modify this application") {
    super(message);
    this.name = "ApplicationForbiddenError";
  }
}
