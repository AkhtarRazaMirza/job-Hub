import type { JobSourceContract } from "./types";
import { JobSourceAdapterNotFoundError, JobSourceAdapterError } from "./errors";

/**
 * Registry pattern for managing JobSource adapters.
 * Grounded in 02_how_to_build.md §5:
 * "Each source adapter converts its data into one internal Job schema.
 * Start with sources that have legitimate API/feed/public-career-page access.
 * Do not hard-code the application flow for every website into the core job system."
 */
export class JobSourceRegistry {
  private readonly adapters = new Map<string, JobSourceContract>();

  /**
   * Register a new job source adapter.
   */
  register(adapter: JobSourceContract, options?: { allowOverride?: boolean }): void {
    if (!adapter.id) {
      throw new JobSourceAdapterError("Job source adapter must define a non-empty id.");
    }

    if (this.adapters.has(adapter.id) && !options?.allowOverride) {
      throw new JobSourceAdapterError(
        `Job source adapter with ID "${adapter.id}" is already registered.`
      );
    }

    this.adapters.set(adapter.id, adapter);
  }

  /**
   * Unregister an adapter by its ID.
   */
  unregister(sourceId: string): boolean {
    return this.adapters.delete(sourceId);
  }

  /**
   * Retrieve an adapter by its ID, or undefined if not found.
   */
  get(sourceId: string): JobSourceContract | undefined {
    return this.adapters.get(sourceId);
  }

  /**
   * Retrieve an adapter by its ID, or throw JobSourceAdapterNotFoundError.
   */
  require(sourceId: string): JobSourceContract {
    const adapter = this.adapters.get(sourceId);
    if (!adapter) {
      throw new JobSourceAdapterNotFoundError(sourceId);
    }
    return adapter;
  }

  /**
   * Check whether an adapter is registered for a given source ID.
   */
  has(sourceId: string): boolean {
    return this.adapters.has(sourceId);
  }

  /**
   * Return all currently registered adapters.
   */
  list(): JobSourceContract[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Clear all registered adapters.
   */
  clear(): void {
    this.adapters.clear();
  }
}

/**
 * Global default registry singleton instance.
 */
export const jobSourceRegistry = new JobSourceRegistry();
