export * from "./job";
export * from "./matching";

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
];
