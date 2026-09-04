export * from "./job";
export * from "./matching";
export * from "./learning";

import {
  jobDiscoveryTriggerEvent,
  jobDiscoveredEvent,
  jobNormalizeRequestedEvent,
  jobNormalizedEvent,
  jobVerifiedEvent,
  jobDuplicateDetectedEvent,
  jobIngestedEvent,
} from "./job";

import {
  jobMatchRequestedEvent,
  jobMatchedEvent,
} from "./matching";

import {
  learningRefreshRequestedEvent,
} from "./learning";

export const inngestEvents = [
  jobDiscoveryTriggerEvent,
  jobDiscoveredEvent,
  jobNormalizeRequestedEvent,
  jobNormalizedEvent,
  jobVerifiedEvent,
  jobDuplicateDetectedEvent,
  jobIngestedEvent,
  jobMatchRequestedEvent,
  jobMatchedEvent,
  learningRefreshRequestedEvent,
];
