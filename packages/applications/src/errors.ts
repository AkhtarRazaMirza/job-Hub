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

export class ResumeTruthfulnessViolationError extends ApplicationError {
  readonly violations: Array<{ type: string; message: string; claim: string }>;

  constructor(
    violations: Array<{ type: string; message: string; claim: string }>
  ) {
    const summary = violations.map((v) => `[${v.type}] ${v.message}`).join("; ");
    super(`Resume tailoring truthfulness check failed: ${summary}`);
    this.name = "ResumeTruthfulnessViolationError";
    this.violations = violations;
  }
}

export class TailoredResumeNotFoundError extends ApplicationError {
  constructor(identifier: string) {
    super(`Tailored resume not found: ${identifier}`);
    this.name = "TailoredResumeNotFoundError";
  }
}

export class TailoredResumeForbiddenError extends ApplicationError {
  constructor(message = "You do not have permission to access or modify this tailored resume") {
    super(message);
    this.name = "TailoredResumeForbiddenError";
  }
}

export class CoverLetterTruthfulnessViolationError extends ApplicationError {
  readonly violations: Array<{ type: string; message: string; claim: string }>;

  constructor(
    violations: Array<{ type: string; message: string; claim: string }>
  ) {
    const summary = violations.map((v) => `[${v.type}] ${v.message}`).join("; ");
    super(`Cover letter truthfulness check failed: ${summary}`);
    this.name = "CoverLetterTruthfulnessViolationError";
    this.violations = violations;
  }
}

export class CoverLetterNotFoundError extends ApplicationError {
  constructor(identifier: string) {
    super(`Cover letter not found: ${identifier}`);
    this.name = "CoverLetterNotFoundError";
  }
}

export class CoverLetterForbiddenError extends ApplicationError {
  constructor(message = "You do not have permission to access or modify this cover letter") {
    super(message);
    this.name = "CoverLetterForbiddenError";
  }
}

export class ApplicationAnswerTruthfulnessViolationError extends ApplicationError {
  readonly violations: Array<{ question: string; violationType: string; message: string }>;

  constructor(
    violations: Array<{ question: string; violationType: string; message: string }>
  ) {
    const summary = violations.map((v) => `[${v.violationType}] ${v.message}`).join("; ");
    super(`Application answers truthfulness check failed: ${summary}`);
    this.name = "ApplicationAnswerTruthfulnessViolationError";
    this.violations = violations;
  }
}

export class ApplicationAnswerNotFoundError extends ApplicationError {
  constructor(identifier: string) {
    super(`Application answer not found: ${identifier}`);
    this.name = "ApplicationAnswerNotFoundError";
  }
}
