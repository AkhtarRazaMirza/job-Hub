/**
 * Job Hub — Phase 8 / Step 8.7
 * Assisted Browser Execution Dialog Component & Invariants Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Browser agent flow")
 * - 04_ai_agent_skills.md §14, §15, §16
 *
 * Tests:
 * 1. UI Component Integrity: Component file exists and exports BrowserExecutionDialog
 * 2. Accessibility Gate: Includes standard dialog role, aria-labelledby, aria-modal, and close button
 * 3. Pre-Submission Human Approval Gate: Submit button disabled without explicit confirmation
 * 4. Absolute Safety Stops: Renders prominent alert banner when stopped for CAPTCHA, MFA, Auth Wall, etc.
 * 5. Candidate Truthfulness: Renders KNOWN, UNSAFE, AMBIGUOUS, and confidence badges
 * 6. Uncertain Submission Handling: Renders clear guidance that application remains PREPARED on uncertainty
 * 7. Verified Submission Display: Displays confirmation reference and APPLIED status indicator
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Phase 8 / Step 8.7 — Assisted Browser Execution UI Suite", async (t) => {
  const componentPath = path.resolve(
    process.cwd(),
    "apps/web/components/applications/browser-execution-dialog.tsx"
  );

  await t.test("1. UI Component Integrity: Component file exists and exports BrowserExecutionDialog", () => {
    assert.ok(fs.existsSync(componentPath), "Component file must exist");
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(
      source.includes("export function BrowserExecutionDialog"),
      "Must export BrowserExecutionDialog component"
    );
  });

  await t.test("2. Accessibility Gate: Includes dialog role, aria-modal, aria-labelledby, and accessible buttons", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(source.includes('role="dialog"'), "Must include role=dialog");
    assert.ok(source.includes('aria-modal="true"'), "Must include aria-modal=true");
    assert.ok(
      source.includes('aria-labelledby="browser-dialog-title"'),
      "Must link title via aria-labelledby"
    );
    assert.ok(
      source.includes('aria-label="Close dialog"'),
      "Must have accessible close button"
    );
  });

  await t.test("3. Pre-Submission Human Approval Gate: Submit button requires explicit user authorization", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(
      source.includes("Pre-Submission Human Approval Gate"),
      "Must display explicit Pre-Submission Human Approval section"
    );
    assert.ok(
      source.includes("confirm-submission-checkbox"),
      "Must have explicit confirmation checkbox"
    );
    assert.ok(
      source.includes("canApproveAndSubmit"),
      "Must enforce canApproveAndSubmit predicate"
    );
    assert.ok(
      source.includes("userConfirmedReview"),
      "Must require userConfirmedReview boolean"
    );
    assert.ok(
      source.includes("disabled={!canApproveAndSubmit}"),
      "Submit button must be disabled when approval conditions are not met"
    );
  });

  await t.test("4. Absolute Safety Halts: Prominently warns on CAPTCHA, Auth Wall, MFA, or safety stops", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(
      source.includes("STOPPED_SAFETY"),
      "Must support STOPPED_SAFETY status"
    );
    assert.ok(
      source.includes("Safety Stop Triggered:"),
      "Must display safety stop banner"
    );
    assert.ok(
      source.includes("The agent never attempts to bypass CAPTCHA"),
      "Must display strict automated bypass prohibition rule"
    );
  });

  await t.test("5. Field Classification & Confidence: Renders KNOWN, UNSAFE, AMBIGUOUS, and VERIFIED badges", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(source.includes("KNOWN"), "Must render KNOWN classification badge");
    assert.ok(source.includes("UNSAFE"), "Must render UNSAFE classification badge");
    assert.ok(source.includes("AMBIGUOUS"), "Must render AMBIGUOUS classification badge");
    assert.ok(source.includes("VERIFIED"), "Must render VERIFIED confidence indicator");
    assert.ok(source.includes("INFERRED"), "Must render INFERRED confidence indicator");
    assert.ok(source.includes("User Required"), "Must render User Required indicator");
  });

  await t.test("6. Candidate Truthfulness & Field Confirmation: Allows reviewing and editing field answers", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(
      source.includes("handleSaveField"),
      "Must provide handleSaveField callback"
    );
    assert.ok(
      source.includes("unresolvedRequiredFields"),
      "Must compute and flag unresolved required fields"
    );
    assert.ok(
      source.includes("hasUnsafeUnverifiedFields"),
      "Must flag unverified sensitive questions (visa, salary, demographics)"
    );
  });

  await t.test("7. Uncertain Submission Handling: Prevents duplicate applications and explains PREPARED state", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(
      source.includes("Submission State Uncertain"),
      "Must render submission state uncertainty notification"
    );
    assert.ok(
      source.includes("To prevent duplicate submissions, the application was <strong>NOT</strong> marked as APPLIED"),
      "Must explicitly clarify that application remains PREPARED"
    );
  });

  await t.test("8. Verified Submission Display: Renders confirmation reference and success state", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(
      source.includes("Application Successfully Submitted & Verified!"),
      "Must display verified success banner"
    );
    assert.ok(
      source.includes("submissionSuccess"),
      "Must display confirmation reference code"
    );
  });
});
