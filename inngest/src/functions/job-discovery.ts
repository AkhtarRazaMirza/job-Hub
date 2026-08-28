/**
 * Durable Job Discovery Workflow
 * Grounded in 02_how_to_build.md §4:
 *
 * "Use Inngest for: scheduled job discovery, job normalization, job deduplication..."
 * "Use retries, idempotency and step boundaries so the same event does not create duplicate jobs."
 */

import { inngest } from "../client";
import { jobSourceRegistry } from "@job-hub/jobs";
import type { JobDiscoveryTriggerData } from "../events/job";

export const discoverJobsFunction = inngest.createFunction(
  {
    id: "discover-jobs",
    name: "Discover Jobs From Sources",
    retries: 3,
    triggers: [
      { event: "jobs/discovery.trigger" },
      { cron: "0 */4 * * *" }, // Scheduled discovery every 4 hours
    ],
  },
  async ({ event, step }) => {
    // Type-safe event data extraction whether triggered by event or cron
    const eventPayload: JobDiscoveryTriggerData | undefined =
      event.name === "jobs/discovery.trigger" && event.data && typeof event.data === "object"
        ? (event.data as JobDiscoveryTriggerData)
        : undefined;

    // Step 1: Resolve which adapters to execute
    const sourcesToRun = await step.run("resolve-job-sources", async () => {
      const requestedSourceId = eventPayload?.sourceId;

      if (requestedSourceId) {
        const adapter = jobSourceRegistry.get(requestedSourceId);
        if (!adapter) {
          throw new Error(`Requested job source "${requestedSourceId}" is not registered.`);
        }
        return [{ id: adapter.id, name: adapter.name, type: adapter.type }];
      }

      const allAdapters = jobSourceRegistry.list();
      return allAdapters.map((a) => ({ id: a.id, name: a.name, type: a.type }));
    });

    const discoveryResults: {
      sourceId: string;
      discoveredCount: number;
      rawJobIds: string[];
    }[] = [];

    // Step 2: Run discovery for each resolved adapter with step isolation
    for (const source of sourcesToRun) {
      const adapterResult = await step.run(`discover-from-${source.id}`, async () => {
        const adapter = jobSourceRegistry.require(source.id);
        const discovered = await adapter.discover({
          limit: eventPayload?.limit,
          tag: eventPayload?.tag,
        });

        return {
          sourceId: source.id,
          discoveredCount: discovered.length,
          rawJobs: discovered.map((job) => ({
            source: job.source,
            sourceJobId: job.sourceJobId,
            url: job.url,
            data: job.data as Record<string, unknown>,
            discoveredAt: job.discoveredAt.toISOString(),
          })),
        };
      });

      discoveryResults.push({
        sourceId: adapterResult.sourceId,
        discoveredCount: adapterResult.discoveredCount,
        rawJobIds: adapterResult.rawJobs.map((j) => j.sourceJobId),
      });

      // Step 3: Emit typed job.discovered events for downstream processing pipeline
      if (adapterResult.rawJobs.length > 0) {
        await step.sendEvent(
          `emit-discovered-events-${source.id}`,
          adapterResult.rawJobs.map((rawJob) => ({
            name: "job.discovered" as const,
            data: {
              source: rawJob.source,
              sourceJobId: rawJob.sourceJobId,
              url: rawJob.url,
              data: rawJob.data,
              discoveredAt: rawJob.discoveredAt,
            },
          }))
        );
      }
    }

    const totalDiscovered = discoveryResults.reduce((acc, curr) => acc + curr.discoveredCount, 0);

    return {
      success: true,
      totalDiscovered,
      sourcesProcessed: sourcesToRun.map((s) => s.id),
      details: discoveryResults,
      completedAt: new Date().toISOString(),
    };
  }
);

Object.defineProperty(discoverJobsFunction, "id", {
  value: "discover-jobs",
  configurable: true,
  writable: true,
});
