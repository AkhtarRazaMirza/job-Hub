export * from "./job";

import {
  jobDiscoveryTriggerEvent,
  jobDiscoveredEvent,
  jobNormalizeRequestedEvent,
} from "./job";

export const inngestEvents = [
  jobDiscoveryTriggerEvent,
  jobDiscoveredEvent,
  jobNormalizeRequestedEvent,
];
