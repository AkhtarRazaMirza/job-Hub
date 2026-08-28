/**
 * Durable Candidate-Job Matching Workflow
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7
 * - 02_how_to_build.md §4 ("match candidate → save score")
 * - 02_how_to_build.md §8 (Deterministic filtering)
 * - 02_how_to_build.md §9 (Initial weighted score formula & hard constraint override)
 * - 04_ai_agent_skills.md §9 & §10 (Match decision & explanation)
 * - 04_ai_agent_skills.md §21 & §23 (Durable orchestration & non-negotiable AI rules)
 *
 * Workflow:
 * Event (job.match.requested)
 *   ↓
 * Inngest Function (match-candidate-job)
 *   ↓ step.run: load-candidate-data
 *   ↓ step.run: load-job-data
 *   ↓ step.run: evaluate-hard-constraints
 *   ↓ step.run: compute-match-scores
 *   ↓ step.run: generate-ai-explanation
 *   ↓ step.run: persist-job-match (idempotent upsert via JobMatchRepository)
 *   ↓ step.sendEvent: emit-job-matched
 */

import { NonRetriableError } from "inngest";
import { inngest } from "../client";
import type {
  CandidateMatchData,
  JobMatchData,
  ScoringWeights,
} from "@job-hub/matching";
import {
  evaluateHardConstraints,
  calculateMatchScores,
  MatchExplainer,
  DEFAULT_SCORING_WEIGHTS,
  buildCandidateMatchData,
  buildJobMatchData,
} from "@job-hub/matching";
import {
  jobMatchRepository as defaultJobMatchRepository,
  type JobMatchRepository,
} from "@job-hub/matching/server";
import {
  jobRepository as defaultJobRepository,
  type JobRepository,
} from "@job-hub/jobs/server";
import {
  DrizzleCandidateProfileRepository,
  DrizzleCandidatePreferencesRepository,
  DrizzleProjectsRepository,
  type CandidateProfileRepository,
  type CandidatePreferencesRepository,
  type ProjectsRepository,
} from "@job-hub/candidate/server";
import { defaultAiProvider, type AiProvider } from "@job-hub/ai";

export interface MatchingWorkflowDependencies {
  candidateProfileRepo?: CandidateProfileRepository;
  candidatePreferencesRepo?: CandidatePreferencesRepository;
  projectsRepo?: ProjectsRepository;
  jobRepo?: JobRepository;
  jobMatchRepo?: JobMatchRepository;
  aiProvider?: AiProvider;
  referenceDate?: Date;
}

/**
 * Creates the durable matching function with customizable dependencies (for testing & injection).
 */
export function createMatchCandidateJobFunction(deps?: MatchingWorkflowDependencies) {
  const candidateProfileRepo =
    deps?.candidateProfileRepo ?? new DrizzleCandidateProfileRepository();
  const candidatePreferencesRepo =
    deps?.candidatePreferencesRepo ?? new DrizzleCandidatePreferencesRepository();
  const projectsRepo = deps?.projectsRepo ?? new DrizzleProjectsRepository();
  const jobRepo = deps?.jobRepo ?? defaultJobRepository;
  const jobMatchRepo = deps?.jobMatchRepo ?? defaultJobMatchRepository;
  const aiProvider = deps?.aiProvider ?? defaultAiProvider;
  const fixedReferenceDate = deps?.referenceDate;

  return inngest.createFunction(
    {
      id: "match-candidate-job",
      name: "Match Candidate and Job",
      retries: 3,
      triggers: [
        { event: "job.match.requested" },
      ],
    },
    async ({ event, step }) => {
      const { candidateProfileId, jobId, customWeights } = event.data;

      // -----------------------------------------------------------------------
      // Step 1: Load Canonical Candidate Profile & Preferences
      // -----------------------------------------------------------------------
      const candidateData = await step.run("load-candidate-data", async () => {
        const profile = await candidateProfileRepo.findById(candidateProfileId);
        if (!profile) {
          throw new NonRetriableError(
            `Candidate profile with ID "${candidateProfileId}" was not found.`
          );
        }

        const preferences = await candidatePreferencesRepo.findByProfileId(candidateProfileId);
        const projects = await projectsRepo.findByProfileId(candidateProfileId);

        return buildCandidateMatchData(profile, preferences, projects);
      });

      // -----------------------------------------------------------------------
      // Step 2: Load Canonical Job Record
      // -----------------------------------------------------------------------
      const jobData = await step.run("load-job-data", async () => {
        const job = await jobRepo.findById(jobId);
        if (!job) {
          throw new NonRetriableError(`Job with ID "${jobId}" was not found.`);
        }

        return buildJobMatchData(job);
      });

      // -----------------------------------------------------------------------
      // Step 3: Evaluate Hard Constraints (Pure deterministic)
      // -----------------------------------------------------------------------
      const hardConstraints = await step.run("evaluate-hard-constraints", async () => {
        const refDate = fixedReferenceDate ?? new Date();
        return evaluateHardConstraints(candidateData, jobData, refDate);
      });

      // -----------------------------------------------------------------------
      // Step 4: Compute Seven-Factor Weighted Score
      // -----------------------------------------------------------------------
      const scoringResult = await step.run("compute-match-scores", async () => {
        const refDate = fixedReferenceDate ?? new Date();
        return calculateMatchScores(
          candidateData,
          jobData,
          hardConstraints,
          customWeights as ScoringWeights | undefined,
          refDate
        );
      });

      // -----------------------------------------------------------------------
      // Step 5: AI Semantic Evaluation / Match Explainer
      // -----------------------------------------------------------------------
      const explanation = await step.run("generate-ai-explanation", async () => {
        if (!hardConstraints.passed) {
          // Rule: Hard constraints disqualify match. Do NOT call AI, return audit explanation.
          return {
            strengths: ["Candidate profile evaluated against job opportunity"],
            gaps: hardConstraints.failures,
            risks: hardConstraints.failures,
            explanation: `Match disqualified by hard constraint: ${hardConstraints.failures.join(" ")}`,
            confidence: 1.0,
          };
        }

        const explainer = new MatchExplainer(aiProvider);
        return await explainer.explain({
          candidate: candidateData,
          job: jobData,
          hardConstraints,
          overallScore: scoringResult.overallScore,
          decision: scoringResult.decision,
          categoryScores: scoringResult.categoryScores,
          weights: scoringResult.weightsUsed ?? DEFAULT_SCORING_WEIGHTS,
        });
      });

      // -----------------------------------------------------------------------
      // Step 6: Persist JobMatch into PostgreSQL (Idempotent upsert via repository)
      // -----------------------------------------------------------------------
      const persistedMatch = await step.run("persist-job-match", async () => {
        return await jobMatchRepo.upsert({
          candidateProfileId,
          jobId,
          overallScore: scoringResult.overallScore,
          decision: scoringResult.decision,
          hardConstraintsPassed: hardConstraints.passed,
          hardConstraintFailures: hardConstraints.failures,
          categoryScores: scoringResult.categoryScores,
          strengths: explanation.strengths,
          gaps: explanation.gaps,
          risks: explanation.risks,
          explanation: explanation.explanation,
          confidence: explanation.confidence,
          weightsUsed: scoringResult.weightsUsed,
        });
      });

      // -----------------------------------------------------------------------
      // Step 7: Emit Completion Event
      // -----------------------------------------------------------------------
      await step.sendEvent("emit-job-matched", {
        name: "job.matched" as const,
        data: {
          matchId: persistedMatch.id,
          candidateProfileId,
          jobId,
          overallScore: scoringResult.overallScore,
          decision: scoringResult.decision,
          hardConstraintsPassed: hardConstraints.passed,
          matchedAt: new Date().toISOString(),
        },
      });

      return {
        status: "MATCHED" as const,
        matchId: persistedMatch.id,
        candidateProfileId,
        jobId,
        overallScore: scoringResult.overallScore,
        decision: scoringResult.decision,
        hardConstraintsPassed: hardConstraints.passed,
      };
    }
  );
}

export const matchCandidateJobFunction = createMatchCandidateJobFunction();
