import { router } from "../init";
import { candidateRouter } from "./candidate";

export const appRouter = router({
  candidate: candidateRouter,
});

export type AppRouter = typeof appRouter;
