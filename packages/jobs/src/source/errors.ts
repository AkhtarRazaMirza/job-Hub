import { JobError } from "../errors";

/**
 * Base error for JobSource adapter operations.
 */
export class JobSourceAdapterError extends JobError {
  constructor(message: string, code = "JOB_SOURCE_ADAPTER_ERROR") {
    super(message, code);
    this.name = "JobSourceAdapterError";
  }
}

/**
 * Thrown when an external job source request fails due to network, HTTP, or DNS errors.
 */
export class JobSourceNetworkError extends JobSourceAdapterError {
  constructor(
    message: string,
    public readonly sourceId: string,
    public readonly statusCode?: number
  ) {
    super(message, "JOB_SOURCE_NETWORK_ERROR");
    this.name = "JobSourceNetworkError";
  }
}

/**
 * Thrown when an external job source returns HTTP 429 Too Many Requests.
 */
export class JobSourceRateLimitError extends JobSourceAdapterError {
  constructor(
    message: string,
    public readonly sourceId: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message, "JOB_SOURCE_RATE_LIMIT_ERROR");
    this.name = "JobSourceRateLimitError";
  }
}

/**
 * Thrown when an external job source returns an unexpected or malformed payload.
 */
export class JobSourceParseError extends JobSourceAdapterError {
  constructor(
    message: string,
    public readonly sourceId: string,
    public readonly details?: unknown
  ) {
    super(message, "JOB_SOURCE_PARSE_ERROR");
    this.name = "JobSourceParseError";
  }
}

/**
 * Thrown when looking up a source adapter by ID that is not registered.
 */
export class JobSourceAdapterNotFoundError extends JobSourceAdapterError {
  constructor(public readonly sourceId: string) {
    super(`Job source adapter "${sourceId}" is not registered.`, "JOB_SOURCE_ADAPTER_NOT_FOUND");
    this.name = "JobSourceAdapterNotFoundError";
  }
}
