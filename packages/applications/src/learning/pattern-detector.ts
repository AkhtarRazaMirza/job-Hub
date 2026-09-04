/**
 * Job Hub — Phase 10 / Step 10.3
 * Deterministic Pattern Detection Engine
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine")
 * - 04_ai_agent_skills.md §20 ("Learning Skill") & §21 ("RecommendationAgent")
 *
 * Invariants Enforced:
 * 1. Zero Hallucination: Patterns emerge strictly from calculated outcome metrics.
 * 2. Small Sample Awareness: Enforces sample thresholds (HIGH >= 10, MEDIUM >= 4, LOW < 4).
 * 3. Non-Causal Phrasing: Explicitly states observational correlation, never causality.
 * 4. Like-for-Like Comparisons: Discloses sample sizes of both primary and comparison cohorts.
 * 5. Candidate Truth Protection: Never infers candidate skills or mutates profile facts.
 */

import type {
  ConfidenceLevel,
  DetectedPattern,
  EvidenceMetric,
  OutcomeEvidence,
  RecommendationType,
} from "./types";
import type { OutcomeCohortAnalysis } from "./analyzer";

export const MIN_HIGH_CONFIDENCE_SAMPLE = 10;
export const MIN_MEDIUM_CONFIDENCE_SAMPLE = 4;
export const MIN_MEANINGFUL_LIFT = 0.1; // 10 percentage points lift over comparison or baseline

/**
 * Classifies confidence based on sample size and sample disparity.
 */
export function classifyConfidence(
  primaryApplications: number,
  comparisonApplications?: number | null
): ConfidenceLevel {
  const effectiveSample =
    comparisonApplications !== undefined && comparisonApplications !== null
      ? Math.min(primaryApplications, comparisonApplications)
      : primaryApplications;

  if (effectiveSample >= MIN_HIGH_CONFIDENCE_SAMPLE) {
    return "HIGH";
  }
  if (effectiveSample >= MIN_MEDIUM_CONFIDENCE_SAMPLE) {
    return "MEDIUM";
  }
  return "LOW_CONFIDENCE";
}

export class PatternDetector {
  /**
   * Deterministically evaluates outcome cohorts to identify statistically grounded patterns.
   */
  detectPatterns(cohorts: OutcomeCohortAnalysis): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const baseline = cohorts.baseline;

    // Minimum overall applications to establish candidate-level patterns
    if (cohorts.totalApplications < 3) {
      return [];
    }

    // 1. Detect Role Patterns
    const rolePatterns = this.detectRolePatterns(cohorts.roles, baseline);
    patterns.push(...rolePatterns);

    // 2. Detect Source Patterns
    const sourcePatterns = this.detectSourcePatterns(cohorts.sources, baseline);
    patterns.push(...sourcePatterns);

    // 3. Detect Match Score Band Patterns
    const bandPatterns = this.detectScoreBandPatterns(cohorts.scoreBands, baseline);
    patterns.push(...bandPatterns);

    // 4. Detect Resume Version Patterns
    const resumePatterns = this.detectResumeVersionPatterns(cohorts.resumeVersions, baseline);
    patterns.push(...resumePatterns);

    // 5. Detect Skill Patterns
    const skillPatterns = this.detectSkillPatterns(cohorts.skills, baseline);
    patterns.push(...skillPatterns);

    // Sort deterministically: HIGH > MEDIUM > LOW_CONFIDENCE, then by primary applications
    const confidenceOrder: Record<ConfidenceLevel, number> = {
      HIGH: 3,
      MEDIUM: 2,
      LOW_CONFIDENCE: 1,
    };

    return patterns.sort((a, b) => {
      const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
      if (confDiff !== 0) return confDiff;
      return b.evidence.primaryMetric.applications - a.evidence.primaryMetric.applications;
    });
  }

  private detectRolePatterns(
    roles: OutcomeCohortAnalysis["roles"],
    baseline: EvidenceMetric
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    if (roles.length === 0) return patterns;

    // Sort roles by interviewRate desc
    const sorted = [...roles].filter((r) => r.metric.applications >= 2 && r.metric.interviewRate !== null);
    if (sorted.length === 0) return patterns;

    const top = sorted[0];
    const topRate = top.metric.interviewRate ?? 0;
    const baselineRate = baseline.interviewRate ?? 0;

    // Check if top role outperforms baseline or a lower-performing role
    const lowerRole = sorted.find(
      (r) =>
        r.role !== top.role &&
        r.metric.applications >= 2 &&
        (topRate - (r.metric.interviewRate ?? 0) >= MIN_MEANINGFUL_LIFT)
    );

    if (topRate > 0 && (topRate - baselineRate >= MIN_MEANINGFUL_LIFT || lowerRole)) {
      const confidence = classifyConfidence(
        top.metric.applications,
        lowerRole ? lowerRole.metric.applications : null
      );
      const isMeaningful = confidence !== "LOW_CONFIDENCE";

      const comparisonMetric = lowerRole ? lowerRole.metric : baseline;
      const comparisonValue = lowerRole ? lowerRole.role : "Overall Baseline";

      const evidence: OutcomeEvidence = {
        dimension: "role",
        primaryValue: top.role,
        primaryMetric: top.metric,
        comparisonValue,
        comparisonMetric,
        sampleSize: top.metric.applications + (lowerRole ? lowerRole.metric.applications : 0),
        minSampleSizeThreshold: MIN_MEDIUM_CONFIDENCE_SAMPLE,
        isStatisticallyMeaningful: isMeaningful,
        explanation: `${top.role} observed ${top.metric.disclosureText} compared to ${comparisonValue} (${comparisonMetric.disclosureText}).`,
      };

      patterns.push({
        type: "ROLE_FOCUS",
        dimension: "role",
        targetKey: `role:${top.role}`,
        title: `Higher Interview Conversion in ${top.role} Roles`,
        summary: `Applications for ${top.role} are currently observing higher interview rates than other roles.`,
        explanation: `Based on observed outcomes, applications for ${top.role} have yielded an interview rate of ${((topRate) * 100).toFixed(1)}% (${top.metric.interviews} of ${top.metric.applications}), compared to ${comparisonValue} (${((comparisonMetric.interviewRate ?? 0) * 100).toFixed(1)}%).`,
        confidence,
        evidence,
      });
    }

    return patterns;
  }

  private detectSourcePatterns(
    sources: OutcomeCohortAnalysis["sources"],
    baseline: EvidenceMetric
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    if (sources.length === 0) return patterns;

    const sorted = [...sources].filter(
      (s) => s.metric.applications >= 2 && s.metric.interviewRate !== null
    );
    if (sorted.length === 0) return patterns;

    const top = sorted[0];
    const topRate = top.metric.interviewRate ?? 0;
    const baselineRate = baseline.interviewRate ?? 0;

    const lowerSource = sorted.find(
      (s) =>
        s.source !== top.source &&
        s.metric.applications >= 2 &&
        (topRate - (s.metric.interviewRate ?? 0) >= MIN_MEANINGFUL_LIFT)
    );

    if (topRate > 0 && (topRate - baselineRate >= MIN_MEANINGFUL_LIFT || lowerSource)) {
      const confidence = classifyConfidence(
        top.metric.applications,
        lowerSource ? lowerSource.metric.applications : null
      );
      const isMeaningful = confidence !== "LOW_CONFIDENCE";

      const comparisonMetric = lowerSource ? lowerSource.metric : baseline;
      const comparisonValue = lowerSource ? lowerSource.source : "Overall Pipeline";

      const evidence: OutcomeEvidence = {
        dimension: "source",
        primaryValue: top.source,
        primaryMetric: top.metric,
        comparisonValue,
        comparisonMetric,
        sampleSize: top.metric.applications + (lowerSource ? lowerSource.metric.applications : 0),
        minSampleSizeThreshold: MIN_MEDIUM_CONFIDENCE_SAMPLE,
        isStatisticallyMeaningful: isMeaningful,
        explanation: `${top.source} observed ${top.metric.disclosureText} compared to ${comparisonValue} (${comparisonMetric.disclosureText}).`,
      };

      patterns.push({
        type: "SOURCE_FOCUS",
        dimension: "source",
        targetKey: `source:${top.source}`,
        title: `Stronger Conversion from ${top.source}`,
        summary: `Applications submitted via ${top.source} have observed stronger interview conversion.`,
        explanation: `Observed data indicates applications from ${top.source} produced an interview rate of ${((topRate) * 100).toFixed(1)}% (${top.metric.interviews} of ${top.metric.applications}), compared to ${comparisonValue} (${((comparisonMetric.interviewRate ?? 0) * 100).toFixed(1)}%).`,
        confidence,
        evidence,
      });
    }

    return patterns;
  }

  private detectScoreBandPatterns(
    bands: OutcomeCohortAnalysis["scoreBands"],
    baseline: EvidenceMetric
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const highBand = bands.find((b) => b.band === "85-100" && b.metric.applications >= 2);
    if (!highBand) return patterns;

    const highRate = highBand.metric.interviewRate ?? 0;
    const baselineRate = baseline.interviewRate ?? 0;

    if (highRate > 0 && highRate - baselineRate >= MIN_MEANINGFUL_LIFT) {
      const confidence = classifyConfidence(highBand.metric.applications);
      const evidence: OutcomeEvidence = {
        dimension: "match_score_band",
        primaryValue: "85-100",
        primaryMetric: highBand.metric,
        comparisonValue: "All Applications",
        comparisonMetric: baseline,
        sampleSize: highBand.metric.applications,
        minSampleSizeThreshold: MIN_MEDIUM_CONFIDENCE_SAMPLE,
        isStatisticallyMeaningful: confidence !== "LOW_CONFIDENCE",
        explanation: `Applications in the 85-100 match band observed ${highBand.metric.disclosureText} vs overall baseline (${baseline.disclosureText}).`,
      };

      patterns.push({
        type: "MATCH_SCORE_BAND",
        dimension: "match_score_band",
        targetKey: "band:85-100",
        title: "High Match Scores Correlate with Interview Conversion",
        summary: "Applications with match scores of 85 or above observed higher interview conversion.",
        explanation: `Observed applications in the 85–100 match score band achieved an interview rate of ${((highRate) * 100).toFixed(1)}% (${highBand.metric.interviews} of ${highBand.metric.applications}), compared to your baseline rate of ${((baselineRate) * 100).toFixed(1)}%.`,
        confidence,
        evidence,
      });
    }

    return patterns;
  }

  private detectResumeVersionPatterns(
    resumes: OutcomeCohortAnalysis["resumeVersions"],
    baseline: EvidenceMetric
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    if (resumes.length < 2) return patterns;

    const sorted = [...resumes].filter(
      (r) => r.metric.applications >= 2 && r.metric.interviewRate !== null
    );
    if (sorted.length < 2) return patterns;

    const top = sorted[0];
    const comparison = sorted[1];
    const topRate = top.metric.interviewRate ?? 0;
    const compRate = comparison.metric.interviewRate ?? 0;

    if (topRate - compRate >= MIN_MEANINGFUL_LIFT && topRate > 0) {
      const confidence = classifyConfidence(
        top.metric.applications,
        comparison.metric.applications
      );
      const evidence: OutcomeEvidence = {
        dimension: "resume_version",
        primaryValue: top.version,
        primaryMetric: top.metric,
        comparisonValue: comparison.version,
        comparisonMetric: comparison.metric,
        sampleSize: top.metric.applications + comparison.metric.applications,
        minSampleSizeThreshold: MIN_MEDIUM_CONFIDENCE_SAMPLE,
        isStatisticallyMeaningful: confidence !== "LOW_CONFIDENCE",
        explanation: `Resume "${top.version}" observed ${top.metric.disclosureText} compared to "${comparison.version}" (${comparison.metric.disclosureText}).`,
      };

      patterns.push({
        type: "RESUME_VERSION",
        dimension: "resume_version",
        targetKey: `resume:${top.version}`,
        title: `Higher Response with Resume "${top.version}"`,
        summary: `Applications using "${top.version}" observed higher interview response rates.`,
        explanation: `Observed data indicates applications submitted with "${top.version}" reached an interview rate of ${((topRate) * 100).toFixed(1)}% (${top.metric.interviews} of ${top.metric.applications}) versus ${((compRate) * 100).toFixed(1)}% for "${comparison.version}".`,
        confidence,
        evidence,
      });
    }

    return patterns;
  }

  private detectSkillPatterns(
    skills: OutcomeCohortAnalysis["skills"],
    baseline: EvidenceMetric
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    if (skills.length === 0) return patterns;

    // Filter skills with at least 3 applications and positive interview rate
    const candidates = skills.filter(
      (s) => s.metric.applications >= 3 && (s.metric.interviewRate ?? 0) > 0
    );
    if (candidates.length === 0) return patterns;

    const topSkill = candidates[0];
    const topRate = topSkill.metric.interviewRate ?? 0;
    const baselineRate = baseline.interviewRate ?? 0;

    if (topRate - baselineRate >= MIN_MEANINGFUL_LIFT) {
      const confidence = classifyConfidence(topSkill.metric.applications);
      const evidence: OutcomeEvidence = {
        dimension: "skill",
        primaryValue: topSkill.skill,
        primaryMetric: topSkill.metric,
        comparisonValue: "General Pipeline",
        comparisonMetric: baseline,
        sampleSize: topSkill.metric.applications,
        minSampleSizeThreshold: MIN_MEDIUM_CONFIDENCE_SAMPLE,
        isStatisticallyMeaningful: confidence !== "LOW_CONFIDENCE",
        explanation: `Jobs matching skill "${topSkill.skill}" observed ${topSkill.metric.disclosureText} vs baseline (${baseline.disclosureText}).`,
      };

      patterns.push({
        type: "SKILL_INSIGHT",
        dimension: "skill",
        targetKey: `skill:${topSkill.skill}`,
        title: `Strong Results for Listings Featuring "${topSkill.skill}"`,
        summary: `Job applications mentioning "${topSkill.skill}" are observing higher interview progression.`,
        explanation: `In your applications for roles requiring "${topSkill.skill}", ${topSkill.metric.interviews} of ${topSkill.metric.applications} (${((topRate) * 100).toFixed(1)}%) reached the interview stage, exceeding your baseline rate of ${((baselineRate) * 100).toFixed(1)}%.`,
        confidence,
        evidence,
      });
    }

    return patterns;
  }
}
