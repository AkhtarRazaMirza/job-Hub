/**
 * Job Hub — Phase 10 / Step 10.7
 * Learning Inngest Event Definitions
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine")
 * - 03_tech_stack.md §4 ("Inngest for background orchestration")
 */

import { z } from "zod";

export const learningRefreshRequestedEventSchema = z.object({
  name: z.literal("learning/refresh.requested"),
  data: z.object({
    candidateProfileId: z.string().min(1),
    force: z.boolean().default(false),
  }),
});

export type LearningRefreshRequestedEvent = z.infer<
  typeof learningRefreshRequestedEventSchema
>;

export const learningRefreshRequestedEvent = {
  name: "learning/refresh.requested",
  schema: learningRefreshRequestedEventSchema,
};
