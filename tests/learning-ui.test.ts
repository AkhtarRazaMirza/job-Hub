/**
 * Job Hub — Phase 10 / Step 10.8 Focused Test Suite
 * Learning Dashboard UI Components & Invariants
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine UI")
 * - 04_ai_agent_skills.md §20 ("Learning Skill")
 *
 * Verifies:
 * 1. UI Component Integrity: LearningTab exported and mounted in DashboardView.
 * 2. Tab Navigation: "Learning" tab button present with Lightbulb icon and active state.
 * 3. Candidate Truth Protection Invariant: Explicit notice that profile/skills/resume are NEVER altered.
 * 4. Non-Causal Framing Invariant: Framed strictly as observational correlations.
 * 5. Empirical Evidence Metrics: Displays Primary vs Comparison cohorts with rates and denominators.
 * 6. Confidence Levels: Clearly identifies HIGH, MEDIUM, and LOW confidence sample sizes.
 * 7. Candidate Agency: Provides both Acknowledge & Focus and Dismiss actions.
 * 8. Truthful Empty State: Displays clear threshold requirement (3+ applications) when no data exists.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Phase 10 / Step 10.8 — Learning Dashboard UI Suite", async (t) => {
  const learningTabPath = path.resolve(
    process.cwd(),
    "apps/web/components/dashboard/learning-tab.tsx"
  );
  const dashboardViewPath = path.resolve(
    process.cwd(),
    "apps/web/components/dashboard/dashboard-view.tsx"
  );

  await t.test("1. UI Component Integrity: LearningTab exists and is exported", () => {
    assert.ok(fs.existsSync(learningTabPath), "learning-tab.tsx must exist");
    const tabSource = fs.readFileSync(learningTabPath, "utf-8");
    assert.ok(
      tabSource.includes("export function LearningTab"),
      "Must export LearningTab component"
    );
  });

  await t.test("2. Tab Navigation: DashboardView mounts LearningTab and renders tab button", () => {
    assert.ok(fs.existsSync(dashboardViewPath), "dashboard-view.tsx must exist");
    const dashSource = fs.readFileSync(dashboardViewPath, "utf-8");

    assert.ok(
      dashSource.includes('import { LearningTab } from "./learning-tab"'),
      "DashboardView must import LearningTab"
    );
    assert.ok(
      dashSource.includes('setActiveTab("learning")'),
      "DashboardView must allow selecting learning tab"
    );
    assert.ok(
      dashSource.includes('activeTab === "learning" && <LearningTab />'),
      "DashboardView must render LearningTab when activeTab is learning"
    );
    assert.ok(
      dashSource.includes("<span>Learning</span>"),
      "DashboardView must render Learning button label"
    );
  });

  await t.test("3. Candidate Truth Protection Invariant: Explicit truth safety notice rendered", () => {
    const tabSource = fs.readFileSync(learningTabPath, "utf-8");

    assert.ok(
      tabSource.includes("Truthful Advisory Only"),
      "Must display Truthful Advisory notice"
    );
    assert.ok(
      tabSource.includes("Recommendations never alter your verified skills, experience, or master resume"),
      "Must explicitly affirm that candidate facts remain untouched"
    );
  });

  await t.test("4. Non-Causal Framing Invariant: Framed strictly as observational correlations", () => {
    const tabSource = fs.readFileSync(learningTabPath, "utf-8");

    assert.ok(
      tabSource.includes("non-causal observations"),
      "Must describe insights as non-causal observations"
    );
    assert.ok(
      tabSource.includes("Deterministic observations derived from real application outcomes"),
      "Must frame metrics as deterministic observations"
    );
    assert.ok(
      !tabSource.includes("guaranteed to cause"),
      "Must never promise causation"
    );
  });

  await t.test("5. Empirical Evidence Metrics: Renders primary vs comparison cohorts with full disclosures", () => {
    const tabSource = fs.readFileSync(learningTabPath, "utf-8");

    assert.ok(
      tabSource.includes("Empirical Outcome Evidence"),
      "Must include empirical evidence header"
    );
    assert.ok(
      tabSource.includes("Primary: {rec.evidence.primaryValue}"),
      "Must render primary cohort label"
    );
    assert.ok(
      tabSource.includes("rec.evidence.comparisonValue"),
      "Must render comparison cohort label"
    );
    assert.ok(
      tabSource.includes("rec.evidence.primaryMetric.disclosureText"),
      "Must render formatted interview rate disclosure"
    );
  });

  await t.test("6. Confidence Levels: Renders confidence badges with sample size context", () => {
    const tabSource = fs.readFileSync(learningTabPath, "utf-8");

    assert.ok(
      tabSource.includes("High Confidence (≥10 apps)"),
      "Must define HIGH confidence badge"
    );
    assert.ok(
      tabSource.includes("Medium Confidence (4–9 apps)"),
      "Must define MEDIUM confidence badge"
    );
    assert.ok(
      tabSource.includes("Low Confidence") && tabSource.includes("&lt;4 apps)"),
      "Must define LOW confidence badge"
    );
  });

  await t.test("7. Candidate Agency: Provides both Acknowledge and Dismiss controls", () => {
    const tabSource = fs.readFileSync(learningTabPath, "utf-8");

    assert.ok(
      tabSource.includes("Acknowledge & Focus"),
      "Must include action to acknowledge recommendation"
    );
    assert.ok(
      tabSource.includes("handleAcknowledge(rec.id)"),
      "Must hook up acknowledge action"
    );
    assert.ok(
      tabSource.includes("handleDismiss(rec.id)"),
      "Must hook up dismiss action"
    );
    assert.ok(
      tabSource.includes('trpcClient.learning.acknowledge.mutate'),
      "Must call tRPC learning.acknowledge endpoint"
    );
    assert.ok(
      tabSource.includes('trpcClient.learning.dismiss.mutate'),
      "Must call tRPC learning.dismiss endpoint"
    );
  });

  await t.test("8. Truthful Empty State: Displays minimum requirement when 0 recommendations exist", () => {
    const tabSource = fs.readFileSync(learningTabPath, "utf-8");

    assert.ok(
      tabSource.includes("No Active Recommendations"),
      "Must include empty state title"
    );
    assert.ok(
      tabSource.includes("at least 3 submitted applications"),
      "Must truthfully communicate 3+ application threshold"
    );
    assert.ok(
      tabSource.includes("Status: Learning Engine Ready"),
      "Must communicate ready status"
    );
  });
});
