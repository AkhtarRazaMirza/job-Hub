import { router } from "../init";
import { candidateRouter } from "./candidate";
import { resumeRouter } from "./resume";

export const appRouter = router({
  candidate: candidateRouter,
  resume: resumeRouter,
});

export type AppRouter = typeof appRouter;
