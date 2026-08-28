/**
 * Job Hub — Shared Inngest Client
 * Grounded in 02_how_to_build.md §4 and 03_tech_stack.md §5.
 *
 * Configures the centralized Inngest client for background and durable workflows.
 */

import { Inngest } from "inngest";

export function createInngestClient(options?: {
  fetch?: typeof fetch;
  baseUrl?: string;
}) {
  return new Inngest({
    id: "job-hub",
    fetch: options?.fetch,
    baseUrl: options?.baseUrl,
  });
}

export const inngest = createInngestClient();
