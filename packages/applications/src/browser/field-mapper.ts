/**
 * Job Hub — Phase 8 / Step 8.3
 * Form Inspector & Candidate Data Mapping Engine
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Detect form -> Map fields -> Fill verified fields -> Upload approved resume")
 * - 04_ai_agent_skills.md §14 ("Browser Agent Skill: map application fields to verified candidate data")
 *
 * Invariants:
 * - Truthfulness: Never fabricate candidate info, work authorization, or qualifications.
 * - Sourced strictly from approved Preparation Package and verified candidate profile.
 * - USER_REQUIRED fields and sensitive questions (visa/salary/relocation/legal/demographics) MUST NEVER be auto-filled without explicit confirmation.
 */

import type { BrowserFieldMapping, BrowserUploadedDocument } from "@job-hub/db";
import type { ApplicationPreparationPackage } from "../orchestrator/types";
import { classifyFormField } from "./safety";
import type {
  BrowserPageState,
  CandidateSafetyContext,
  InspectedInputField,
} from "./types";

export interface CandidateFormFillingProfile {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  city?: string | null;
  country?: string | null;
  postalCode?: string | null;
  headline?: string | null;
  summary?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
}

export interface CandidateFormContext {
  profile: CandidateFormFillingProfile;
  preparationPackage?: ApplicationPreparationPackage | null;
  explicitOverrides?: Record<string, string>;
}

export interface FormInspectionResult {
  formDetected: boolean;
  confidence: number;
  indicators: string[];
  fieldMappings: BrowserFieldMapping[];
  documentsToUpload: BrowserUploadedDocument[];
  requiresUserInput: boolean;
  unmappedCount: number;
  unsafeCount: number;
  knownCount: number;
}

/**
 * Normalizes question strings for accurate matching between form inputs and prepared answers.
 */
function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derives first and last names if only full name is available.
 */
function deriveNameParts(profile: CandidateFormFillingProfile): {
  firstName: string;
  lastName: string;
  fullName: string;
} {
  const fullName = (profile.name || "").trim();
  if (profile.firstName && profile.lastName) {
    return {
      firstName: profile.firstName.trim(),
      lastName: profile.lastName.trim(),
      fullName: fullName || `${profile.firstName.trim()} ${profile.lastName.trim()}`,
    };
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = profile.firstName?.trim() || parts[0] || "";
  const lastName = profile.lastName?.trim() || parts.slice(1).join(" ") || "";

  return { firstName, lastName, fullName };
}

/**
 * Detects whether the inspected page contains an application form.
 */
export function detectApplicationForm(pageState: BrowserPageState): {
  formDetected: boolean;
  confidence: number;
  indicators: string[];
  reason?: string;
} {
  const indicators: string[] = [];
  const inputs = pageState.inputs || [];

  if (inputs.length === 0) {
    return {
      formDetected: false,
      confidence: 0,
      indicators: [],
      reason: "No input fields found on page.",
    };
  }

  // Check for presence of essential job application inputs
  const hasEmail = inputs.some((i) => /(email|e-mail)/i.test([i.name, i.label, i.placeholder].join(" ")));
  if (hasEmail) indicators.push("email_field");

  const hasName = inputs.some((i) => /(name|candidate)/i.test([i.name, i.label, i.placeholder].join(" ")));
  if (hasName) indicators.push("name_field");

  const hasResumeUpload = inputs.some(
    (i) => i.type === "file" && /(resume|cv)/i.test([i.name, i.label, i.placeholder].join(" "))
  );
  if (hasResumeUpload) indicators.push("resume_upload_field");

  const hasPhone = inputs.some((i) => /(phone|mobile|tel)/i.test([i.name, i.label, i.placeholder].join(" ")));
  if (hasPhone) indicators.push("phone_field");

  const hasSubmit = inputs.some(
    (i) => i.type === "button" || /(submit|apply|send application)/i.test([i.name, i.label].join(" "))
  );
  if (hasSubmit) indicators.push("submit_button");

  // Calculate confidence score based on indicators found
  let confidence = 0.2; // base for having inputs
  if (hasEmail) confidence += 0.3;
  if (hasName) confidence += 0.2;
  if (hasResumeUpload) confidence += 0.25;
  if (hasPhone) confidence += 0.05;

  confidence = Math.min(1.0, confidence);
  const formDetected = hasEmail || (hasName && (hasResumeUpload || hasPhone));

  return {
    formDetected,
    confidence,
    indicators,
    reason: formDetected ? undefined : "Page lacks essential application form indicators (name/email/resume).",
  };
}

/**
 * Inspects form fields and maps them deterministically to approved candidate data.
 */
export function mapFormFields(
  inputs: InspectedInputField[],
  context: CandidateFormContext,
  safetyContext?: CandidateSafetyContext
): FormInspectionResult {
  const { profile, preparationPackage, explicitOverrides = {} } = context;
  const { firstName, lastName, fullName } = deriveNameParts(profile);

  const fieldMappings: BrowserFieldMapping[] = [];
  const documentsToUpload: BrowserUploadedDocument[] = [];

  let unmappedCount = 0;
  let unsafeCount = 0;
  let knownCount = 0;

  for (let idx = 0; idx < inputs.length; idx++) {
    const input = inputs[idx]!;
    const fieldId = input.id || input.name || `field_${idx}`;
    const selector = input.selector;
    const combinedLabel = [input.label || "", input.name || "", input.placeholder || ""].join(" ");
    const normalizedInputLabel = normalizeQuestionText(combinedLabel);

    // Initial safety & semantic classification
    const classificationRes = classifyFormField(input, safetyContext);
    let classification = classificationRes.classification;
    let semanticType = classificationRes.semanticType;
    let confidence = classificationRes.confidence || "VERIFIED";
    let requiresUserInput = classificationRes.requiresUserInput;
    let reason = classificationRes.reason;
    let mappedValue: string | undefined;

    // -------------------------------------------------------------------------
    // 1. Check Explicit User Overrides First (Candidate explicit confirmation)
    // -------------------------------------------------------------------------
    const explicitVal = explicitOverrides[fieldId] || (input.name && explicitOverrides[input.name]);
    if (explicitVal !== undefined) {
      classification = "KNOWN";
      confidence = "VERIFIED";
      requiresUserInput = false;
      mappedValue = explicitVal;
      reason = "Candidate explicit override provided";
    }

    // -------------------------------------------------------------------------
    // 2. Map Resume / Document Upload
    // -------------------------------------------------------------------------
    else if (semanticType === "resume_upload" && input.type === "file") {
      if (preparationPackage?.resumeDocument?.storageKey) {
        classification = "KNOWN";
        confidence = "VERIFIED";
        requiresUserInput = false;
        mappedValue = preparationPackage.resumeDocument.storageKey;
        reason = "Approved tailored resume document";

        documentsToUpload.push({
          documentType: "RESUME",
          documentId: preparationPackage.tailoredResume?.id || "tailored_resume",
          fileName: `resume_${preparationPackage.jobId || "application"}.pdf`,
          fileSize: 10240, // typical PDF size
          version: String(preparationPackage.tailoredResume?.version || "1"),
          uploaded: false,
        });
      } else {
        classification = "UNSAFE";
        confidence = "USER_REQUIRED";
        requiresUserInput = true;
        reason = "No approved tailored resume document found in preparation package.";
      }
    }

    // -------------------------------------------------------------------------
    // 3. Map Cover Letter
    // -------------------------------------------------------------------------
    else if (semanticType === "cover_letter") {
      if (preparationPackage?.coverLetter?.content) {
        classification = "KNOWN";
        confidence = "VERIFIED";
        requiresUserInput = false;
        mappedValue = preparationPackage.coverLetter.content;
        reason = "Approved tailored cover letter";
      } else {
        classification = "AMBIGUOUS";
        requiresUserInput = true;
        reason = "No prepared cover letter available in package.";
      }
    }

    // -------------------------------------------------------------------------
    // 4. Map Standard Profile Attributes
    // -------------------------------------------------------------------------
    else if (classification === "KNOWN") {
      switch (semanticType) {
        case "full_name":
          mappedValue = fullName || undefined;
          break;
        case "first_name":
          mappedValue = firstName || undefined;
          break;
        case "last_name":
          mappedValue = lastName || undefined;
          break;
        case "email":
          mappedValue = profile.email || undefined;
          break;
        case "phone":
          mappedValue = profile.phone || undefined;
          break;
        case "linkedin_url":
          mappedValue = profile.linkedinUrl || undefined;
          break;
        case "github_url":
          mappedValue = profile.githubUrl || undefined;
          break;
        case "portfolio_url":
          mappedValue = profile.portfolioUrl || undefined;
          break;
        case "location":
          mappedValue = profile.location || undefined;
          break;
        case "city":
          mappedValue = profile.city || undefined;
          break;
        case "country":
          mappedValue = profile.country || undefined;
          break;
        case "postal_code":
          mappedValue = profile.postalCode || undefined;
          break;
        case "current_title":
          mappedValue = profile.headline || undefined;
          confidence = "INFERRED";
          break;
        case "summary":
          mappedValue = profile.summary || undefined;
          confidence = "INFERRED";
          break;
      }

      // If mapped value is empty from candidate profile, we must mark as requiring user input
      if (!mappedValue) {
        classification = "UNKNOWN";
        requiresUserInput = true;
        confidence = "USER_REQUIRED";
        reason = `Candidate profile does not contain value for '${semanticType}'.`;
      }
    }

    // -------------------------------------------------------------------------
    // 5. Match Prepared Answers from Phase 7 Preparation Package
    // -------------------------------------------------------------------------
    if (!mappedValue && preparationPackage?.answers && preparationPackage.answers.length > 0) {
      const matchedAnswer = preparationPackage.answers.find((a) => {
        const normQ = normalizeQuestionText(a.question);
        return (
          normQ === normalizedInputLabel ||
          normalizedInputLabel.includes(normQ) ||
          normQ.includes(normalizedInputLabel)
        );
      });

      if (matchedAnswer) {
        if (matchedAnswer.confidence === "VERIFIED" || matchedAnswer.isConfirmed) {
          classification = "KNOWN";
          confidence = "VERIFIED";
          requiresUserInput = false;
          mappedValue = matchedAnswer.answer;
          reason = "Matched verified preparation answer";
        } else if (matchedAnswer.confidence === "INFERRED") {
          classification = "AMBIGUOUS";
          confidence = "INFERRED";
          requiresUserInput = true;
          mappedValue = matchedAnswer.answer;
          reason = "Inferred answer requires candidate confirmation before filling";
        } else {
          // USER_REQUIRED
          classification = "UNSAFE";
          confidence = "USER_REQUIRED";
          requiresUserInput = true;
          reason = "Unconfirmed USER_REQUIRED answer strictly requires candidate decision";
        }
      }
    }

    // -------------------------------------------------------------------------
    // Count stats
    // -------------------------------------------------------------------------
    if (classification === "KNOWN" && mappedValue) {
      knownCount++;
    } else if (classification === "UNSAFE") {
      unsafeCount++;
    } else {
      unmappedCount++;
    }

    fieldMappings.push({
      fieldId,
      selector,
      name: input.name,
      label: input.label,
      placeholder: input.placeholder,
      fieldType: input.type,
      semanticType,
      classification,
      value: mappedValue,
      filled: false,
      requiresUserInput,
      confidence,
      reason,
    });
  }

  const overallRequiresUserInput = unsafeCount > 0 || unmappedCount > 0;

  return {
    formDetected: true,
    confidence: 1.0,
    indicators: ["mapped_inputs"],
    fieldMappings,
    documentsToUpload,
    requiresUserInput: overallRequiresUserInput,
    unmappedCount,
    unsafeCount,
    knownCount,
  };
}
