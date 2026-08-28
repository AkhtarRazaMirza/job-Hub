import { jobSourceRegistry } from "./registry";
import { RemoteOkAdapter } from "./adapters/remoteok";
import { ArbeitnowAdapter } from "./adapters/arbeitnow";
import { UserUrlAdapter } from "./adapters/user-url";

export * from "./types";
export * from "./errors";
export * from "./registry";
export * from "./utils";
export * from "./adapters/remoteok";
export * from "./adapters/arbeitnow";
export * from "./adapters/user-url";

/**
 * Register foundational job source adapters in the global registry.
 * Grounded in 01_build_the_system.md §4 Step 3 and 02_how_to_build.md §5.
 */
jobSourceRegistry.register(new RemoteOkAdapter(), { allowOverride: true });
jobSourceRegistry.register(new ArbeitnowAdapter(), { allowOverride: true });
jobSourceRegistry.register(new UserUrlAdapter(), { allowOverride: true });
