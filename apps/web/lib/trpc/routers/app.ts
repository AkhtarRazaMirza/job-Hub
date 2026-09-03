import { router } from "../init";
import { candidateRouter } from "./candidate";
import { resumeRouter } from "./resume";
import { jobsRouter } from "./jobs";
import { matchingRouter } from "./matching";
import { savedJobsRouter } from "./saved-jobs";
import { dashboardRouter } from "./dashboard";
import { applicationsRouter } from "./applications";

export const appRouter = router({
  candidate: candidateRouter,
  resume: resumeRouter,
  jobs: jobsRouter,
  matching: matchingRouter,
  savedJobs: savedJobsRouter,
  dashboard: dashboardRouter,
  applications: applicationsRouter,
});

export type AppRouter = typeof appRouter;
