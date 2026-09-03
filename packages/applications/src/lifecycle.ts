/**
 * Job Hub — Phase 6 / Step 6.2
 * Application Lifecycle State Machine
 *
 * Centralized, authoritative rules for application state transitions.
 * Grounded in:
 * - 01_build_the_system.md §4 Step 13 ("Application states: - Prepared - Applied - Under Review - Interview Scheduled - Interview Completed - Offer - Rejected - Withdrawn")
 * - 02_how_to_build.md §17 ("Write tests for: ... application state transitions")
 */

import {
  type ApplicationStatus,
  APPLICATION_STATUS,
  APPLICATION_STATUS_LABELS,
  TERMINAL_STATUSES,
  VALID_APPLICATION_TRANSITIONS,
} from "./types";
import { InvalidStateTransitionError } from "./errors";

/**
 * Checks if a status is a terminal state.
 * Terminal states cannot transition to any other status.
 */
export function isTerminalStatus(status: ApplicationStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Returns whether a transition from `from` to `to` is legally permitted.
 * A status cannot transition to itself (no-op or invalid transition).
 * A terminal status cannot transition anywhere.
 */
export function isValidTransition(
  from: ApplicationStatus,
  to: ApplicationStatus
): boolean {
  if (from === to) {
    return false;
  }

  if (isTerminalStatus(from)) {
    return false;
  }

  const allowed = VALID_APPLICATION_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Validates a transition and throws InvalidStateTransitionError if illegal.
 */
export function validateTransition(
  from: ApplicationStatus,
  to: ApplicationStatus
): void {
  if (from === to) {
    throw new InvalidStateTransitionError(
      from,
      to,
      "Cannot transition application to its current status"
    );
  }

  if (isTerminalStatus(from)) {
    throw new InvalidStateTransitionError(
      from,
      to,
      `Status '${from}' is terminal and cannot transition to any other status`
    );
  }

  const allowed = VALID_APPLICATION_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    const validList = allowed && allowed.length > 0 ? allowed.join(", ") : "none";
    throw new InvalidStateTransitionError(
      from,
      to,
      `Allowed transitions from '${from}': [${validList}]`
    );
  }
}

/**
 * Returns all valid destination statuses for the current application state.
 */
export function getAllowedTransitions(
  currentStatus: ApplicationStatus
): ApplicationStatus[] {
  return [...(VALID_APPLICATION_TRANSITIONS[currentStatus] ?? [])];
}

/**
 * Returns the human-readable display label for an application status.
 */
export function getStatusLabel(status: ApplicationStatus): string {
  return APPLICATION_STATUS_LABELS[status] ?? status;
}
