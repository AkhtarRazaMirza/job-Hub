/**
 * Job Hub — Phase 8 / Step 8.2
 * Browser Agent Safety Evaluator, Threat Detection & URL Validation Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateBrowserTargetUrl,
  assertValidBrowserTargetUrl,
  startBrowserExecutionClientInputSchema,
  confirmFieldAnswerClientInputSchema,
  approveBrowserSubmissionClientInputSchema,
  cancelBrowserExecutionClientInputSchema,
  evaluateBrowserPageState,
  classifyFormField,
  isCaptchaPresent,
  isAuthWallPresent,
  isMfaPresent,
  isBlockedAutomation,
  BrowserUrlValidationError,
  type BrowserPageState,
  type InspectedInputField,
} from "@job-hub/applications";

test("Phase 8 / Step 8.2 — Browser Agent Safety Evaluator & URL Validation Suite", async (t) => {
  await t.test("1. URL Validation: Valid application URLs on recognized ATS and company domains pass", () => {
    const valid1 = validateBrowserTargetUrl("https://boards.greenhouse.io/stripe/jobs/12345");
    assert.equal(valid1.valid, true);
    assert.equal(valid1.isRecognizedAts, true);
    assert.equal(valid1.domain, "boards.greenhouse.io");

    const valid2 = validateBrowserTargetUrl("https://jobs.lever.co/netflix/67890");
    assert.equal(valid2.valid, true);
    assert.equal(valid2.isRecognizedAts, true);

    const valid3 = validateBrowserTargetUrl(
      "https://example.com/careers/apply",
      "https://example.com/jobs/lead-architect"
    );
    assert.equal(valid3.valid, true);
    assert.equal(valid3.domain, "example.com");

    const normalized = assertValidBrowserTargetUrl("https://boards.greenhouse.io/stripe/jobs/12345");
    assert.equal(normalized, "https://boards.greenhouse.io/stripe/jobs/12345");
  });

  await t.test("2. Anti-SSRF: Loopback, private networks, cloud metadata and non-HTTP URLs are rejected", () => {
    // Non-HTTP
    const fileUrl = validateBrowserTargetUrl("file:///etc/passwd");
    assert.equal(fileUrl.valid, false);
    assert.match(fileUrl.error!, /Forbidden URL protocol/);

    const jsUrl = validateBrowserTargetUrl("javascript:alert(1)");
    assert.equal(jsUrl.valid, false);

    // Embedded credentials
    const credUrl = validateBrowserTargetUrl("https://user:password@evil.com/apply");
    assert.equal(credUrl.valid, false);
    assert.match(credUrl.error!, /embedded user credentials/);

    // Loopback
    const local1 = validateBrowserTargetUrl("http://localhost:3000/apply");
    assert.equal(local1.valid, false);
    assert.match(local1.error!, /strictly forbidden/);

    const local2 = validateBrowserTargetUrl("http://127.0.0.1:8080/apply");
    assert.equal(local2.valid, false);

    // Private networks
    const priv10 = validateBrowserTargetUrl("http://10.0.0.5/internal/apply");
    assert.equal(priv10.valid, false);

    const priv192 = validateBrowserTargetUrl("http://192.168.1.100/apply");
    assert.equal(priv192.valid, false);

    const priv172 = validateBrowserTargetUrl("http://172.20.0.1/apply");
    assert.equal(priv172.valid, false);

    // Cloud Metadata
    const awsMeta = validateBrowserTargetUrl("http://169.254.169.254/latest/meta-data/");
    assert.equal(awsMeta.valid, false);
    assert.match(awsMeta.error!, /metadata/);

    const gcpMeta = validateBrowserTargetUrl("http://metadata.google.internal/computeMetadata/v1/");
    assert.equal(gcpMeta.valid, false);

    // Unexpected domain redirection
    const mismatch = validateBrowserTargetUrl(
      "https://malicious-phish.com/apply",
      "https://legitcompany.com/job/1"
    );
    assert.equal(mismatch.valid, false);
    assert.match(mismatch.error!, /does not match job posting host/);

    // assert throws
    assert.throws(
      () => assertValidBrowserTargetUrl("http://127.0.0.1:8080"),
      BrowserUrlValidationError
    );
  });

  await t.test("3. Threat Detection: CAPTCHA, Auth Walls, MFA, and Blocked Automation are identified", () => {
    // CAPTCHA
    assert.equal(isCaptchaPresent("Please complete the recaptcha to continue"), true);
    assert.equal(isCaptchaPresent("<div class='cf-turnstile'></div>"), true);
    assert.equal(isCaptchaPresent("Verify you are human before applying"), true);
    assert.equal(isCaptchaPresent("Standard job application form"), false);

    // Auth wall
    assert.equal(isAuthWallPresent("Please sign in to apply for this job"), true);
    assert.equal(isAuthWallPresent("Already have an account? Log in"), true);
    assert.equal(isAuthWallPresent("Submit your application details below"), false);

    // MFA
    assert.equal(isMfaPresent("Enter the two-factor authentication code from your app"), true);
    assert.equal(isMfaPresent("Enter your phone number"), false);

    // Blocked automation
    assert.equal(isBlockedAutomation("Cloudflare Ray ID: 87654321 - Access Denied", 403), true);
    assert.equal(isBlockedAutomation("You have been blocked", 403), true);
    assert.equal(isBlockedAutomation("Normal error message", 400), false);
  });

  await t.test("4. Page State Safety Evaluator: Triggers immediate halt on unsafe page states", () => {
    const targetUrl = "https://boards.greenhouse.io/stripe/jobs/123";

    // Clean page
    const cleanState: BrowserPageState = {
      url: targetUrl,
      title: "Stripe Application - Senior Engineer",
      domain: "boards.greenhouse.io",
      httpStatus: 200,
      html: "<form><h1>Job Application</h1><input name='name'/></form>",
    };
    const cleanEval = evaluateBrowserPageState(cleanState, targetUrl);
    assert.equal(cleanEval.safe, true);

    // Captcha halt
    const captchaState: BrowserPageState = {
      ...cleanState,
      html: "<div>Security Check: Please solve the captcha</div>",
    };
    const captchaEval = evaluateBrowserPageState(captchaState, targetUrl);
    assert.equal(captchaEval.safe, false);
    assert.equal(captchaEval.reason, "CAPTCHA_DETECTED");

    // Auth Wall halt
    const authState: BrowserPageState = {
      ...cleanState,
      html: "<div>Sign in to apply to Stripe</div>",
    };
    const authEval = evaluateBrowserPageState(authState, targetUrl);
    assert.equal(authEval.safe, false);
    assert.equal(authEval.reason, "AUTH_REQUIRED");

    // Blocked automation halt
    const blockedState: BrowserPageState = {
      ...cleanState,
      httpStatus: 403,
      html: "<div>Cloudflare Ray ID: 12345 Access Denied</div>",
    };
    const blockedEval = evaluateBrowserPageState(blockedState, targetUrl);
    assert.equal(blockedEval.safe, false);
    assert.equal(blockedEval.reason, "BLOCKED_AUTOMATION");

    // SSRF attempt in page state URL
    const ssrfState: BrowserPageState = {
      ...cleanState,
      url: "http://169.254.169.254/latest/meta-data/",
    };
    const ssrfEval = evaluateBrowserPageState(ssrfState, targetUrl);
    assert.equal(ssrfEval.safe, false);
    assert.equal(ssrfEval.reason, "SSRF_ATTEMPT");
  });

  await t.test("5. Field Classifier: Sensitive immigration, salary, relocation, and legal questions", () => {
    // Visa sponsorship without confirmation -> UNSAFE
    const visaField: InspectedInputField = {
      selector: "input[name='visaSponsorship']",
      name: "visaSponsorship",
      label: "Will you now or in the future require visa sponsorship?",
      type: "radio",
    };
    const visaRes = classifyFormField(visaField);
    assert.equal(visaRes.classification, "UNSAFE");
    assert.equal(visaRes.requiresUserInput, true);
    assert.equal(visaRes.confidence, "USER_REQUIRED");

    // Visa sponsorship WITH pre-confirmation in context -> KNOWN
    const visaConfirmed = classifyFormField(visaField, {
      explicitlyConfirmedFields: { visaSponsorship: "No" },
    });
    assert.equal(visaConfirmed.classification, "KNOWN");
    assert.equal(visaConfirmed.requiresUserInput, false);

    // Salary question without context -> UNSAFE
    const salaryField: InspectedInputField = {
      selector: "input[name='expectedSalary']",
      name: "expectedSalary",
      label: "What is your desired salary / expected compensation?",
      type: "text",
    };
    const salaryRes = classifyFormField(salaryField);
    assert.equal(salaryRes.classification, "UNSAFE");
    assert.equal(salaryRes.requiresUserInput, true);

    // Salary question WITH candidate context -> KNOWN
    const salaryWithContext = classifyFormField(salaryField, { expectedSalary: "150000" });
    assert.equal(salaryWithContext.classification, "KNOWN");

    // Relocation -> UNSAFE
    const relocField: InspectedInputField = {
      selector: "input[name='relocate']",
      name: "relocate",
      label: "Are you willing to relocate for this position?",
      type: "radio",
    };
    assert.equal(classifyFormField(relocField).classification, "UNSAFE");

    // Protected Demographic Characteristics -> UNSAFE
    const demoField: InspectedInputField = {
      selector: "select[name='gender']",
      name: "gender",
      label: "Please select your gender identity",
      type: "select",
    };
    assert.equal(classifyFormField(demoField).classification, "UNSAFE");

    const raceField: InspectedInputField = {
      selector: "select[name='race']",
      name: "race",
      label: "Race and Ethnicity information",
      type: "select",
    };
    assert.equal(classifyFormField(raceField).classification, "UNSAFE");

    // Legal / Criminal Declarations -> UNSAFE
    const legalField: InspectedInputField = {
      selector: "input[name='backgroundDeclaration']",
      name: "backgroundDeclaration",
      label: "Have you ever been convicted of a felony?",
      type: "checkbox",
    };
    assert.equal(classifyFormField(legalField).classification, "UNSAFE");
  });

  await t.test("6. Field Classifier: Known safe fields and Ambiguous/Unknown questions", () => {
    // Name
    const nameField: InspectedInputField = {
      selector: "input[name='fullName']",
      name: "fullName",
      label: "Full Name",
      type: "text",
    };
    const nameRes = classifyFormField(nameField);
    assert.equal(nameRes.classification, "KNOWN");
    assert.equal(nameRes.semanticType, "full_name");
    assert.equal(nameRes.requiresUserInput, false);

    // Email
    const emailField: InspectedInputField = {
      selector: "input[name='email']",
      name: "email",
      label: "Email Address",
      type: "text",
    };
    assert.equal(classifyFormField(emailField).semanticType, "email");

    // Resume file upload
    const resumeUpload: InspectedInputField = {
      selector: "input[type='file'][name='resume']",
      name: "resume",
      label: "Upload your Resume / CV",
      type: "file",
    };
    const resumeRes = classifyFormField(resumeUpload);
    assert.equal(resumeRes.classification, "KNOWN");
    assert.equal(resumeRes.semanticType, "resume_upload");

    // Cover letter
    const coverLetterField: InspectedInputField = {
      selector: "textarea[name='coverLetter']",
      name: "coverLetter",
      label: "Cover Letter",
      type: "textarea",
    };
    assert.equal(classifyFormField(coverLetterField).classification, "KNOWN");

    // Ambiguous
    const ambiguousField: InspectedInputField = {
      selector: "input[name='referral']",
      name: "referral",
      label: "How did you hear about this position?",
      type: "text",
    };
    const ambigRes = classifyFormField(ambiguousField);
    assert.equal(ambigRes.classification, "AMBIGUOUS");
    assert.equal(ambigRes.requiresUserInput, true);

    // Unknown
    const unknownField: InspectedInputField = {
      selector: "input[name='favoriteWidgetColor']",
      name: "favoriteWidgetColor",
      label: "What is your favorite widget system?",
      type: "text",
    };
    const unkRes = classifyFormField(unknownField);
    assert.equal(unkRes.classification, "UNKNOWN");
    assert.equal(unkRes.requiresUserInput, true);
  });

  await t.test("7. Client Input Schemas: Strict schemas reject injected userId or candidateProfileId", () => {
    // Valid input passes
    const validStart = startBrowserExecutionClientInputSchema.parse({
      applicationId: "app_123",
      targetUrl: "https://example.com/apply",
    });
    assert.equal(validStart.applicationId, "app_123");

    // Spoofed userId is strictly rejected by .strict()
    assert.throws(() => {
      startBrowserExecutionClientInputSchema.parse({
        applicationId: "app_123",
        userId: "spoofed_user",
      });
    });

    // Spoofed candidateProfileId is strictly rejected by .strict()
    assert.throws(() => {
      startBrowserExecutionClientInputSchema.parse({
        applicationId: "app_123",
        candidateProfileId: "spoofed_profile",
      });
    });

    // Approval requires confirmed: true
    const validApproval = approveBrowserSubmissionClientInputSchema.parse({
      executionId: "exec_123",
      confirmed: true,
    });
    assert.equal(validApproval.confirmed, true);

    assert.throws(() => {
      approveBrowserSubmissionClientInputSchema.parse({
        executionId: "exec_123",
        confirmed: false,
      });
    });

    // Confirm field schema
    const validConfirm = confirmFieldAnswerClientInputSchema.parse({
      executionId: "exec_123",
      fieldId: "fld_1",
      confirmedValue: "Yes, authorized",
    });
    assert.equal(validConfirm.confirmedValue, "Yes, authorized");

    // Cancel schema
    const validCancel = cancelBrowserExecutionClientInputSchema.parse({
      executionId: "exec_123",
    });
    assert.equal(validCancel.executionId, "exec_123");
  });
});
