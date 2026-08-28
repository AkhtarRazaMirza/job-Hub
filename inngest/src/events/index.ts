export * from "./job";

import {
  jobDiscoveryTriggerEvent,
  jobDiscoveredEvent,
  jobNormalizeRequestedEvent,
  jobNormalizedEvent,
  jobVerifiedEvent,
  jobDuplicateDetectedEvent,
  jobIngestedEvent,
} from "./job";

export const inngestEvents = [
  jobDiscoveryTriggerEvent,
  jobDiscoveredEvent,
  jobNormalizeRequestedEvent,
  jobNormalizedEvent,
  jobVerifiedEvent,
  jobDuplicateDetectedEvent,
  jobIngestedEvent,
];
