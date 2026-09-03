/**
 * Job Hub — Phase 7 / Step 7.5
 * Application Preparation Package Orchestrator Service
 *
 * Orchestrates:
 * Candidate Evidence + Job
 *   ↓
 * Resume Tailoring + Truthfulness Validation
 *   ↓
 * Document Rendering (PDF) + Storage
 *   ↓
 * Cover Letter Generation + Truthfulness Validation
 *   ↓
 * Application Answers Generation + Cautionary Rule Verification
 *   ↓
 * Idempotent Preparation Package Assembly
 *   ↓
 * User Review & Explicit Approval
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("AI application preparation")
 * - 02_how_to_build.md §11 & §12 ("Generate: tailored resume, cover letter, application answers")
 * - 04_ai_agent_skills.md §21 ("Orchestrator pipeline")
 */

import {
  db as defaultDb,
  jobs,
  resumes,
  applications,
  applicationEvents,
  candidateProfiles,
  type Database,
} from "@job-hub/db";
import { eq, and, desc } from "drizzle-orm";
import type {
  ApplicationPreparationPackage,
  PreparePackageInput,
  ApprovePackageInput,
} from "./types";
import { ResumeTailor } from "../tailoring/resume-tailor";
import {
  tailoredResumeRepository,
  type DrizzleTailoredResumeRepository,
} from "../tailoring/tailored-resume-repository";
import {
  tailoredResumeDocumentService,
  type TailoredResumeDocumentService,
} from "../tailoring/document-service";
import { CoverLetterWriter } from "../cover-letter/cover-letter-writer";
import {
  coverLetterRepository,
  type DrizzleCoverLetterRepository,
} from "../cover-letter/cover-letter-repository";
import { ApplicationAnswerer } from "../answers/application-answerer";
import {
  applicationAnswerRepository,
  type DrizzleApplicationAnswerRepository,
} from "../answers/answers-repository";
import {
  unifiedProfileService as defaultUnifiedProfileService,
  type UnifiedProfileService,
} from "@job-hub/candidate/server";
import {
  jobRepository as defaultJobRepository,
  type JobRepository,
  JobNotFoundError,
} from "@job-hub/jobs/server";
import {
  ApplicationNotFoundError,
} from "../errors";
import { OpenAiProvider, type AiProvider } from "@job-hub/ai";

export class ApplicationPreparationService {
  private readonly db: Database;
  private readonly resumeTailor: ResumeTailor;
  private readonly tailoredResumeRepo: DrizzleTailoredResumeRepository;
  private readonly docService: TailoredResumeDocumentService;
  private readonly coverLetterWriter: CoverLetterWriter;
  private readonly coverLetterRepo: DrizzleCoverLetterRepository;
  private readonly answerer: ApplicationAnswerer;
  private readonly answerRepo: DrizzleApplicationAnswerRepository;
  private readonly unifiedProfileService: UnifiedProfileService;
  private readonly jobRepo: JobRepository;

  constructor(dependencies?: {
    db?: Database;
    aiProvider?: AiProvider;
    tailoredResumeRepo?: DrizzleTailoredResumeRepository;
    docService?: TailoredResumeDocumentService;
    coverLetterRepo?: DrizzleCoverLetterRepository;
    answerRepo?: DrizzleApplicationAnswerRepository;
    unifiedProfileService?: UnifiedProfileService;
    jobRepo?: JobRepository;
  }) {
    this.db = dependencies?.db ?? defaultDb;
    const ai = dependencies?.aiProvider ?? new OpenAiProvider();
    this.resumeTailor = new ResumeTailor({ aiProvider: ai });
    this.tailoredResumeRepo =
      dependencies?.tailoredResumeRepo ?? tailoredResumeRepository;
    this.docService =
      dependencies?.docService ?? tailoredResumeDocumentService;
    this.coverLetterWriter = new CoverLetterWriter({ aiProvider: ai });
    this.coverLetterRepo =
      dependencies?.coverLetterRepo ?? coverLetterRepository;
    this.answerer = new ApplicationAnswerer({ aiProvider: ai });
    this.answerRepo =
      dependencies?.answerRepo ?? applicationAnswerRepository;
    this.unifiedProfileService =
      dependencies?.unifiedProfileService ?? defaultUnifiedProfileService;
    this.jobRepo = dependencies?.jobRepo ?? defaultJobRepository;
  }

  /**
   * Prepares a complete, grounded application package for candidate review.
   * Idempotent: reuses already generated artifacts if available.
   */
  async prepareApplicationPackage(
    input: PreparePackageInput
  ): Promise<ApplicationPreparationPackage> {
    const { candidateProfileId, jobId } = input;

    // 1. Fetch Target Job
    const job = await this.jobRepo.findById(jobId);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    // 2. Fetch Unified Candidate Profile via candidate userId
    const [candRow] = await this.db
      .select({ id: candidateProfiles.id, userId: candidateProfiles.userId })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, candidateProfileId))
      .limit(1);

    if (!candRow) {
      throw new Error(`Candidate profile not found: ${candidateProfileId}`);
    }

    const candidateProfile =
      await this.unifiedProfileService.getUnifiedProfile(candRow.userId);

    // 3. Fetch Master Resume (Immutable Source of Truth)
    const masterResumes = await this.db
      .select()
      .from(resumes)
      .where(eq(resumes.candidateProfileId, candidateProfileId))
      .orderBy(desc(resumes.createdAt))
      .limit(1);

    const masterResumeText = masterResumes[0]?.extractedText ?? "";
    const sourceResumeId = masterResumes[0]?.id ?? "";

    // 4. Find or Create Application Record (Idempotent)
    let [app] = await this.db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.candidateProfileId, candidateProfileId),
          eq(applications.jobId, jobId)
        )
      )
      .limit(1);

    if (!app) {
      const [newApp] = await this.db
        .insert(applications)
        .values({
          candidateProfileId,
          jobId,
          company: job.company,
          role: job.title,
          source: job.source,
          applicationUrl: job.applicationUrl,
          status: "PREPARED",
        })
        .returning();
      app = newApp!;
    }

    // 5. Tailor Resume (Idempotent)
    let tailored = await this.tailoredResumeRepo.findLatestByCandidateAndJob(
      candidateProfileId,
      jobId
    );

    if (!tailored) {
      const tailoredResult = await this.resumeTailor.tailor({
        candidate: candidateProfile,
        masterResumeText,
        sourceResumeId,
        job,
        targetTitle: job.title,
      });

      tailored = await this.tailoredResumeRepo.create({
        candidateProfileId,
        jobId,
        sourceResumeId,
        targetTitle: job.title,
        tailoredData: tailoredResult.tailoredData,
        truthfulnessScore: tailoredResult.truthfulness.truthfulnessScore,
        status: "DRAFT",
      });
    }

    // 6. Deterministically Render Resume Document (PDF) & Store
    if (!tailored.storageKey) {
      await this.docService.generateAndStorePdf({
        tailoredResumeId: tailored.id,
        candidateProfileId,
      });
      tailored = (await this.tailoredResumeRepo.findById(
        tailored.id,
        candidateProfileId
      ))!;
    }

    // 7. Generate Cover Letter (Idempotent)
    let coverLetter =
      await this.coverLetterRepo.findLatestByCandidateAndJob(
        candidateProfileId,
        jobId
      );

    if (!coverLetter) {
      const clResult = await this.coverLetterWriter.generateCoverLetter(
        {
          candidate: candidateProfile,
          job,
          customNotes: input.customCoverLetterNotes,
        },
        masterResumeText
      );

      coverLetter = await this.coverLetterRepo.create({
        candidateProfileId,
        jobId,
        data: clResult.data,
        status: "DRAFT",
      });
    }

    // 8. Generate Application Answers (Idempotent)
    let answers = await this.answerRepo.findByApplicationId(
      app.id,
      candidateProfileId
    );

    if (answers.length === 0) {
      const questionsToAnswer =
        input.questions && input.questions.length > 0
          ? input.questions
          : [
              `Why are you interested in the ${job.title} role at ${job.company}?`,
              `What is your background with the primary skills required for this position?`,
              "Will you now or in the future require visa sponsorship?",
              "What are your salary expectations?",
            ];

      const ansResult = await this.answerer.generateAnswers({
        candidate: candidateProfile,
        job,
        questions: questionsToAnswer,
        masterResumeText,
      });

      answers = await this.answerRepo.saveAnswers(
        app.id,
        candidateProfileId,
        ansResult.answers
      );
    }

    // 9. Link Tailored Resume & Cover Letter to Application
    await this.db
      .update(applications)
      .set({
        resumeVersionId: masterResumes[0]?.id ?? null,
        coverLetterVersionId: coverLetter.id,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, app.id));

    // 10. Compute Package Readiness & Review Flags
    const unconfirmedCount = answers.filter(
      (a) => a.confidence === "USER_REQUIRED" && !a.isConfirmed
    ).length;
    const hasUserRequiredFields = unconfirmedCount > 0;
    const isApproved =
      tailored.status === "APPROVED" && coverLetter.status === "APPROVED";

    return {
      applicationId: app.id,
      candidateProfileId,
      jobId,
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        remoteType: job.remoteType,
        skills: job.skills ?? [],
      },
      tailoredResume: tailored,
      resumeDocument: {
        storageKey: tailored.storageKey ?? "",
        mimeType: "application/pdf",
      },
      coverLetter,
      answers,
      status: app.status,
      hasUserRequiredFields,
      unconfirmedCount,
      isApproved,
    };
  }

  /**
   * Retrieves an assembled preparation package by applicationId with candidate isolation.
   */
  async getPackage(
    applicationId: string,
    candidateProfileId: string
  ): Promise<ApplicationPreparationPackage> {
    const [app] = await this.db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.candidateProfileId, candidateProfileId)
        )
      )
      .limit(1);

    if (!app) {
      throw new ApplicationNotFoundError(applicationId);
    }

    const job = await this.jobRepo.findById(app.jobId);
    if (!job) {
      throw new JobNotFoundError(app.jobId);
    }

    const tailored = await this.tailoredResumeRepo.findLatestByCandidateAndJob(
      candidateProfileId,
      app.jobId
    );

    if (!tailored) {
      throw new Error(`Tailored resume not found for application ${applicationId}`);
    }

    const coverLetter = await this.coverLetterRepo.findLatestByCandidateAndJob(
      candidateProfileId,
      app.jobId
    );

    if (!coverLetter) {
      throw new Error(`Cover letter not found for application ${applicationId}`);
    }

    const answers = await this.answerRepo.findByApplicationId(
      applicationId,
      candidateProfileId
    );

    const unconfirmedCount = answers.filter(
      (a) => a.confidence === "USER_REQUIRED" && !a.isConfirmed
    ).length;
    const hasUserRequiredFields = unconfirmedCount > 0;
    const isApproved =
      tailored.status === "APPROVED" && coverLetter.status === "APPROVED";

    return {
      applicationId: app.id,
      candidateProfileId,
      jobId: app.jobId,
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        remoteType: job.remoteType,
        skills: job.skills ?? [],
      },
      tailoredResume: tailored,
      resumeDocument: {
        storageKey: tailored.storageKey ?? "",
        mimeType: "application/pdf",
      },
      coverLetter,
      answers,
      status: app.status,
      hasUserRequiredFields,
      unconfirmedCount,
      isApproved,
    };
  }

  /**
   * User explicitly approves application materials.
   * NOTE: Does NOT submit the application! Status remains PREPARED.
   */
  async approvePackage(
    input: ApprovePackageInput
  ): Promise<ApplicationPreparationPackage> {
    const { applicationId, candidateProfileId } = input;

    const pkg = await this.getPackage(applicationId, candidateProfileId);

    // 1. Mark tailored resume as APPROVED
    await this.tailoredResumeRepo.updateStatus(
      pkg.tailoredResume.id,
      candidateProfileId,
      "APPROVED"
    );

    // 2. Mark cover letter as APPROVED
    await this.coverLetterRepo.update({
      id: pkg.coverLetter.id,
      candidateProfileId,
      content: pkg.coverLetter.content,
      status: "APPROVED",
    });

    // 3. Record Audit Event: PACKAGE_APPROVED
    await this.db.insert(applicationEvents).values({
      applicationId,
      eventType: "STATUS_CHANGED",
      fromStatus: pkg.status,
      toStatus: pkg.status, // Stays PREPARED, NOT APPLIED!
      notes: "Candidate approved application preparation materials (Tailored Resume, Cover Letter, Answers).",
      metadata: {
        approvedTailoredResumeId: pkg.tailoredResume.id,
        approvedCoverLetterId: pkg.coverLetter.id,
        unconfirmedCount: pkg.unconfirmedCount,
      },
    });

    return await this.getPackage(applicationId, candidateProfileId);
  }
}

export const applicationPreparationService = new ApplicationPreparationService();
