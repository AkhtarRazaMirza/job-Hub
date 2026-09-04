/**
 * Job Hub — Phase 8 / Step 8.2
 * Browser Agent Safety Evaluator, Threat Detection & Field Classifier
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Detect uncertain/sensitive fields -> Pause -> User review -> User approval")
 * - 04_ai_agent_skills.md §15 ("Browser Safety Skill: CAPTCHA, Auth, Unknown work auth, salary, sensitive questions, blocked automation")
 */

import type {
  BrowserPageState,
  CandidateSafetyContext,
  FieldClassificationResult,
  InspectedInputField,
  SafetyEvaluationResult,
} from "./types";
import { validateBrowserTargetUrl } from "./validation";

// -----------------------------------------------------------------------------
// Threat & Challenge Patterns
// -----------------------------------------------------------------------------

const CAPTCHA_SIGNALS = [
  /captcha/i,
  /recaptcha/i,
  /g-recaptcha/i,
  /hcaptcha/i,
  /cf-turnstile/i,
  /turnstile/i,
  /arkoselabs/i,
  /funcaptcha/i,
  /verify\s+you\s+are\s+human/i,
  /human\s+verification/i,
  /are\s+you\s+a\s+robot/i,
  /complete\s+the\s+captcha/i,
  /solve\s+(the\s+)?captcha/i,
  /security\s+check/i,
  /distil\s+networks/i,
  /datadome/i,
  /perimeterx/i,
  /bot\s+detection/i,
];

const AUTH_WALL_SIGNALS = [
  /sign\s+in\s+to\s+apply/i,
  /log\s+in\s+to\s+apply/i,
  /sign\s+in\s+to\s+continue/i,
  /log\s+in\s+to\s+continue/i,
  /create\s+an\s+account\s+to\s+apply/i,
  /already\s+have\s+an\s+account\?\s*log\s+in/i,
  /please\s+sign\s+in/i,
  /login\s+with\s+google/i,
  /sign\s+in\s+with\s+linkedin/i,
];

const MFA_SIGNALS = [
  /two-factor\s+authentication/i,
  /2-step\s+verification/i,
  /authenticator\s+app/i,
  /enter\s+verification\s+code/i,
  /one-time\s+passcode/i,
  /security\s+code\s+sent/i,
  /sms\s+code/i,
  /otp\b/i,
];

const BLOCKED_AUTOMATION_SIGNALS = [
  /access\s+denied/i,
  /request\s+blocked/i,
  /you\s+have\s+been\s+blocked/i,
  /cloudflare\s+ray\s+id/i,
  /attention\s+required!\s+\|\s+cloudflare/i,
  /error\s+1020\s+access\s+denied/i,
  /perimeterx\s+detected/i,
  /automated\s+access\s+blocked/i,
];

// -----------------------------------------------------------------------------
// Sensitive Topic Patterns
// -----------------------------------------------------------------------------

const VISA_SPONSORSHIP_REGEX = /(visa|sponsorship|sponsor|authorized\s+to\s+work|work\s+authorization|legal\s+right\s+to\s+work|work\s+permit|h-1b|f-1\s*opt|green\s*card|immigration|right\s+to\s+work)/i;
const SALARY_REGEX = /(salary|desired\s+pay|expected\s+compensation|compensation\s+expectation|minimum\s+pay|target\s+pay|hourly\s+rate|expected\s+salary|current\s+salary)/i;
const RELOCATION_REGEX = /(relocat|willing\s+to\s+relocate|open\s+to\s+relocation|relocation\s+assistance)/i;
const LEGAL_DECLARATION_REGEX = /(convict|felony|misdemeanor|criminal\s+record|criminal\s+history|background\s+check|non-compete|nda\b|agree\s+to\s+terms|declare\s+that|certify\s+under\s+penalty|i\s+certify\s+that|true\s+and\s+correct)/i;
const DEMOGRAPHIC_SENSITIVE_REGEX = /(race\b|ethnicity|hispanic|latino|gender\s+identity|sexual\s+orientation|disability|handicap|veteran\s+status|protected\s+veteran|medical\s+condition|health\s+condition|marital\s+status|religion)/i;

// -----------------------------------------------------------------------------
// Known Safe Field Mappings
// -----------------------------------------------------------------------------

interface SafeFieldPattern {
  semanticType: string;
  regex: RegExp;
  confidence: "VERIFIED" | "INFERRED";
}

const KNOWN_SAFE_FIELDS: SafeFieldPattern[] = [
  { semanticType: "first_name", regex: /^(first[_\s-]?name|given[_\s-]?name|fname)$/i, confidence: "VERIFIED" },
  { semanticType: "last_name", regex: /^(last[_\s-]?name|family[_\s-]?name|surname|lname)$/i, confidence: "VERIFIED" },
  { semanticType: "full_name", regex: /^(full[_\s-]?name|name|candidate[_\s-]?name|your[_\s-]?name)$/i, confidence: "VERIFIED" },
  { semanticType: "email", regex: /^(email|e-mail|email[_\s-]?address)$/i, confidence: "VERIFIED" },
  { semanticType: "phone", regex: /^(phone|telephone|mobile|phone[_\s-]?number|cell)$/i, confidence: "VERIFIED" },
  { semanticType: "linkedin_url", regex: /(linkedin|linked[_\s-]?in|linkedin[_\s-]?url|linkedin[_\s-]?profile)/i, confidence: "VERIFIED" },
  { semanticType: "github_url", regex: /(github|git[_\s-]?hub|github[_\s-]?url|github[_\s-]?profile)/i, confidence: "VERIFIED" },
  { semanticType: "portfolio_url", regex: /(portfolio|personal[_\s-]?website|website[_\s-]?url|portfolio[_\s-]?url|personal[_\s-]?url)/i, confidence: "VERIFIED" },
  { semanticType: "resume_upload", regex: /(resume|cv|curriculum[_\s-]?vitae|resume[_\s-]?cv|upload[_\s-]?resume)/i, confidence: "VERIFIED" },
  { semanticType: "cover_letter", regex: /(cover[_\s-]?letter|letter|message\s+to\s+hiring\s+manager|note\s+to\s+recruiter)/i, confidence: "VERIFIED" },
  { semanticType: "location", regex: /^(location|address|city[,\s]+state|current\s+location)$/i, confidence: "VERIFIED" },
  { semanticType: "city", regex: /^(city|town)$/i, confidence: "VERIFIED" },
  { semanticType: "country", regex: /^(country|nation)$/i, confidence: "VERIFIED" },
  { semanticType: "postal_code", regex: /^(zip|zip[_\s-]?code|postal|postal[_\s-]?code)$/i, confidence: "VERIFIED" },
  { semanticType: "current_title", regex: /^(current[_\s-]?title|job[_\s-]?title|headline|role)$/i, confidence: "INFERRED" },
  { semanticType: "summary", regex: /^(summary|bio|about[_\s-]?you|professional[_\s-]?summary)$/i, confidence: "INFERRED" },
];

// -----------------------------------------------------------------------------
// Evaluator Implementation
// -----------------------------------------------------------------------------

/**
 * Checks whether text or HTML contains CAPTCHA markers.
 */
export function isCaptchaPresent(content: string): boolean {
  if (!content) return false;
  return CAPTCHA_SIGNALS.some((regex) => regex.test(content));
}

/**
 * Checks whether text or HTML contains authentication or login walls.
 */
export function isAuthWallPresent(content: string): boolean {
  if (!content) return false;
  return AUTH_WALL_SIGNALS.some((regex) => regex.test(content));
}

/**
 * Checks whether text or HTML contains MFA challenges.
 */
export function isMfaPresent(content: string): boolean {
  if (!content) return false;
  return MFA_SIGNALS.some((regex) => regex.test(content));
}

/**
 * Checks whether text or HTML contains blocked automation indicators.
 */
export function isBlockedAutomation(content: string, httpStatus?: number): boolean {
  if (httpStatus === 403 || httpStatus === 429) {
    if (content && BLOCKED_AUTOMATION_SIGNALS.some((regex) => regex.test(content))) {
      return true;
    }
  }
  if (!content) return false;
  return BLOCKED_AUTOMATION_SIGNALS.some((regex) => regex.test(content));
}

/**
 * Evaluates the full page state for critical safety stops before form interaction.
 */
export function evaluateBrowserPageState(
  pageState: BrowserPageState,
  targetUrl: string
): SafetyEvaluationResult {
  const content = [
    pageState.title || "",
    pageState.url || "",
    pageState.html || "",
  ].join(" ");

  // 1. SSRF & URL consistency check
  const urlCheck = validateBrowserTargetUrl(pageState.url, targetUrl);
  if (!urlCheck.valid) {
    return {
      safe: false,
      reason: "SSRF_ATTEMPT",
      message: urlCheck.error || "Target URL security violation detected.",
      details: { url: pageState.url, targetUrl },
    };
  }

  // 2. Unexpected external redirection check
  try {
    const origHost = new URL(targetUrl).hostname.toLowerCase();
    const currHost = new URL(pageState.url).hostname.toLowerCase();
    if (origHost !== currHost && !urlCheck.isRecognizedAts && !currHost.endsWith(`.${origHost}`)) {
      return {
        safe: false,
        reason: "UNEXPECTED_REDIRECT",
        message: `Application page redirected from '${origHost}' to unexpected external host '${currHost}'.`,
        details: { originalUrl: targetUrl, currentUrl: pageState.url },
      };
    }
  } catch {
    // Malformed URL caught by urlCheck
  }

  // 3. Blocked automation detection
  if (pageState.hasBlockedMessage || isBlockedAutomation(content, pageState.httpStatus)) {
    return {
      safe: false,
      reason: "BLOCKED_AUTOMATION",
      message: "The target website has blocked automated access or presented a security barrier.",
      details: { httpStatus: pageState.httpStatus },
    };
  }

  // 4. CAPTCHA detection
  if (pageState.hasCaptcha || isCaptchaPresent(content)) {
    return {
      safe: false,
      reason: "CAPTCHA_DETECTED",
      message: "CAPTCHA or anti-bot human challenge detected. Immediate safety halt triggered.",
      details: { url: pageState.url },
    };
  }

  // 5. Auth wall / Login requirement detection
  if (pageState.hasAuthWall || isAuthWallPresent(content)) {
    return {
      safe: false,
      reason: "AUTH_REQUIRED",
      message: "An unexpected login wall or authentication prompt was encountered.",
      details: { url: pageState.url },
    };
  }

  // 6. MFA / 2FA detection
  if (pageState.hasMfa || isMfaPresent(content)) {
    return {
      safe: false,
      reason: "MFA_REQUIRED",
      message: "Multi-Factor Authentication (MFA) challenge encountered.",
      details: { url: pageState.url },
    };
  }

  return { safe: true };
}

/**
 * Classifies an inspected form field into KNOWN, UNKNOWN, AMBIGUOUS, or UNSAFE.
 */
export function classifyFormField(
  field: InspectedInputField,
  safetyContext?: CandidateSafetyContext
): FieldClassificationResult {
  const combinedLabel = [
    field.label || "",
    field.name || "",
    field.placeholder || "",
    field.ariaLabel || "",
  ].join(" ").trim();

  // If no descriptive identifiers exist at all -> UNKNOWN
  if (!combinedLabel) {
    return {
      classification: "UNKNOWN",
      requiresUserInput: true,
      reason: "Input field lacks identifiable label, name, or aria attributes.",
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Sensitive Topics (UNSAFE) — Must halt or require user confirmation
  // ---------------------------------------------------------------------------

  // Check if candidate has already confirmed this exact field in context
  const fieldKey = field.name || field.id || field.selector;
  const isExplicitlyConfirmed =
    (field.id && safetyContext?.confirmedAnswerIds?.has(field.id)) ||
    (fieldKey && safetyContext?.explicitlyConfirmedFields && fieldKey in safetyContext.explicitlyConfirmedFields);

  // A. Visa Sponsorship & Work Authorization
  if (VISA_SPONSORSHIP_REGEX.test(combinedLabel)) {
    if (isExplicitlyConfirmed) {
      return {
        classification: "KNOWN",
        semanticType: "visa_sponsorship",
        requiresUserInput: false,
        confidence: "VERIFIED",
        reason: "Pre-confirmed visa authorization question",
      };
    }
    return {
      classification: "UNSAFE",
      semanticType: "sensitive_work_authorization",
      requiresUserInput: true,
      confidence: "USER_REQUIRED",
      reason: "Work authorization and immigration questions require explicit candidate decision.",
    };
  }

  // B. Salary & Compensation
  if (SALARY_REGEX.test(combinedLabel)) {
    if (isExplicitlyConfirmed || safetyContext?.expectedSalary) {
      return {
        classification: "KNOWN",
        semanticType: "salary_requirement",
        requiresUserInput: false,
        confidence: "VERIFIED",
        reason: "Candidate-specified salary requirement",
      };
    }
    return {
      classification: "UNSAFE",
      semanticType: "sensitive_salary",
      requiresUserInput: true,
      confidence: "USER_REQUIRED",
      reason: "Compensation requirements must not be guessed; candidate input required.",
    };
  }

  // C. Relocation Requirements
  if (RELOCATION_REGEX.test(combinedLabel)) {
    if (isExplicitlyConfirmed || safetyContext?.willingToRelocate !== undefined) {
      return {
        classification: "KNOWN",
        semanticType: "relocation_requirement",
        requiresUserInput: false,
        confidence: "VERIFIED",
        reason: "Candidate-specified relocation preference",
      };
    }
    return {
      classification: "UNSAFE",
      semanticType: "sensitive_relocation",
      requiresUserInput: true,
      confidence: "USER_REQUIRED",
      reason: "Relocation willingness requires explicit candidate confirmation.",
    };
  }

  // D. Legal Declarations & Criminal Background Checks
  if (LEGAL_DECLARATION_REGEX.test(combinedLabel)) {
    return {
      classification: "UNSAFE",
      semanticType: "sensitive_legal_declaration",
      requiresUserInput: true,
      confidence: "USER_REQUIRED",
      reason: "Legal declarations, terms, and background checks require explicit candidate agreement.",
    };
  }

  // E. Demographic & Protected Characteristics
  if (DEMOGRAPHIC_SENSITIVE_REGEX.test(combinedLabel)) {
    return {
      classification: "UNSAFE",
      semanticType: "sensitive_demographics",
      requiresUserInput: true,
      confidence: "USER_REQUIRED",
      reason: "Voluntary demographic disclosures must not be automatically answered by the agent.",
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Known Safe Fields
  // ---------------------------------------------------------------------------

  // File uploads
  if (field.type === "file") {
    if (/resume|cv/i.test(combinedLabel)) {
      return {
        classification: "KNOWN",
        semanticType: "resume_upload",
        requiresUserInput: false,
        confidence: "VERIFIED",
      };
    }
    if (/cover\s*letter/i.test(combinedLabel)) {
      return {
        classification: "KNOWN",
        semanticType: "cover_letter_upload",
        requiresUserInput: false,
        confidence: "VERIFIED",
      };
    }
    return {
      classification: "AMBIGUOUS",
      semanticType: "other_file_upload",
      requiresUserInput: true,
      reason: "Unknown document upload requested by form.",
    };
  }

  // Check known safe patterns against label and name
  const matchCandidates = [field.label || "", field.name || "", field.placeholder || ""];
  for (const pattern of KNOWN_SAFE_FIELDS) {
    for (const text of matchCandidates) {
      if (pattern.regex.test(text.trim())) {
        return {
          classification: "KNOWN",
          semanticType: pattern.semanticType,
          requiresUserInput: false,
          confidence: pattern.confidence,
        };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Ambiguous Fields
  // ---------------------------------------------------------------------------
  if (
    /(other|additional|notes|comments|referral|how\s+did\s+you\s+hear|hear\s+about\s+us)/i.test(
      combinedLabel
    )
  ) {
    return {
      classification: "AMBIGUOUS",
      semanticType: "optional_or_referral",
      requiresUserInput: true,
      reason: "Ambiguous or optional question requires candidate decision.",
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Unknown Question
  // ---------------------------------------------------------------------------
  return {
    classification: "UNKNOWN",
    requiresUserInput: true,
    reason: `Unrecognized application question: '${combinedLabel.substring(0, 80)}'`,
  };
}
