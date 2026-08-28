import { serve } from "inngest/next";
import { inngest, functions } from "@job-hub/inngest";

/**
 * Inngest Serve Endpoint for Next.js App Router.
 * Grounded in 02_how_to_build.md §4 and 03_tech_stack.md §5.
 *
 * Exposes durable workflow functions to the Inngest execution engine.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
