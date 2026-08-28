import { router } from "../init";
import { candidateRouter } from "./candidate";
import { resumeRouter } from "./resume";
import { jobsRouter } from "./jobs";
import { matchingRouter } from "./matching";

export const appRouter = router({
  candidate: candidateRouter,
  resume: resumeRouter,
  jobs: jobsRouter,
  matching: matchingRouter,
});

export type AppRouter = typeof appRouter;
