import { router } from "../init";
import { candidateRouter } from "./candidate";
import { resumeRouter } from "./resume";
import { jobsRouter } from "./jobs";
import { matchingRouter } from "./matching";
import { savedJobsRouter } from "./saved-jobs";
import { dashboardRouter } from "./dashboard";
import { applicationsRouter } from "./applications";
import { browserRouter } from "./browser";
import { analyticsRouter } from "./analytics";
import { learningRouter } from "./learning";

export const appRouter = router({
  candidate: candidateRouter,
  resume: resumeRouter,
  jobs: jobsRouter,
  matching: matchingRouter,
  savedJobs: savedJobsRouter,
  dashboard: dashboardRouter,
  applications: applicationsRouter,
  browser: browserRouter,
  analytics: analyticsRouter,
  learning: learningRouter,
});

export type AppRouter = typeof appRouter;
