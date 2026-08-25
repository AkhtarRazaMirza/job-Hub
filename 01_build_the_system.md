# Job Hub --- AI Build Specification

## 1. Product goal

Build an AI-powered remote-job application platform that acts as a
personal job agent.

The core loop is:

**Profile → Discover → Verify → Normalize → Match → Rank → Prepare →
User Review → Apply → Track → Learn**

The platform should find genuinely remote jobs worldwide, compare them
against a verified candidate profile, prepare a tailored application for
strong matches, assist with the application process, and keep every
application in one dashboard.

## 2. Core product rule

The AI must work from verified candidate information.

It must never invent: - experience - employment history - education -
skills - projects - salary - work authorization - certifications -
achievements - application answers that require unknown facts

If an answer cannot be derived safely from verified profile data, the
system must ask the user.

## 3. Match threshold

Use a 0--10 score.

-   `< 6.0`: Low match --- skip
-   `6.0–7.9`: Maybe --- show for manual review
-   `8.0–8.9`: Strong match --- prepare application
-   `9.0–10.0`: Excellent match --- high priority and prepare
    application

A score of 8/10 does **not** mean automatic final submission.

## 4. Main user flow

### Step 1 --- Build candidate profile

User provides: - Resume PDF/DOCX - GitHub - Portfolio - Optional
LinkedIn - Job preferences - Remote preference - Salary expectations -
Target roles - Experience level

### Step 2 --- AI profiler

Extract and structure: - technical skills - experience - projects -
education - achievements - technologies - strengths - preferences -
work-location preferences

Create a structured candidate profile in PostgreSQL.

### Step 3 --- Job discovery

Collect jobs from sources that can be accessed legitimately: - public
job APIs - approved feeds - ATS/company career pages - permitted
job-board sources - user-provided job URLs

Do not make prohibited scraping or a single platform the foundation of
the system.

### Step 4 --- Job normalization

For every discovered job: - extract title - company - location - remote
policy - salary - experience - skills - requirements - benefits -
posting date - application URL - source - source ID

### Step 5 --- Job verification

Classify: - worldwide remote - remote from specific countries/regions -
hybrid - onsite - unknown

Also check: - application URL - active/closed status - freshness -
obvious duplicates

### Step 6 --- Deduplication

Identify the same job appearing on multiple sources.

Keep one canonical job record and retain all valid source/application
URLs.

### Step 7 --- AI matching

Compare the structured candidate profile with the structured job.

Produce: - overall score - skills match - experience match - education
match - location/remote match - salary match - strengths - gaps -
risks - explanation - recommendation

### Step 8 --- Dashboard

Show: - Excellent matches - Strong matches - Maybe - Skipped - Saved -
Applied

Each job card should show why it matches.

### Step 9 --- Application preparation

For jobs \>= 8/10: - select relevant resume content - generate a
tailored resume version - generate cover letter when useful - prepare
application answers - prepare basic profile information - collect
required documents

Never alter the master resume.

### Step 10 --- User review

Before submission: - preview tailored resume - preview cover letter -
preview answers - preview personal information - highlight uncertain
fields - require user approval

### Step 11 --- Application agent

Use browser automation only where technically and contractually
appropriate.

The agent can: - open application page - navigate forms - fill verified
information - upload approved documents - insert prepared answers -
pause for review

Sensitive/unknown questions require user input.

### Step 12 --- Submission

User gives final approval.

Record: - submission time - job - company - application URL - resume
version - cover-letter version - answers - source - application status

### Step 13 --- Tracking

Application states: - Prepared - Applied - Under Review - Interview
Scheduled - Interview Completed - Offer - Rejected - Withdrawn

### Step 14 --- Analytics and learning

Analyze: - application count - interview rate - response rate - offer
rate - best job types - best companies - best technologies - resume
performance - source performance

Use this data to improve recommendations, not to fabricate candidate
information.

## 5. Implementation phases

### Phase 1 --- Foundation

Next.js, TypeScript, authentication, PostgreSQL, Drizzle, UI foundation.

### Phase 2 --- Candidate profile

Resume upload, parsing, GitHub integration, portfolio input, structured
profile.

### Phase 3 --- Job ingestion

Job sources, ingestion workflows, normalization, verification,
deduplication.

### Phase 4 --- Matching

AI job extraction, candidate-job matching, scoring, explanations.

### Phase 5 --- Dashboard

Job feed, filters, saved jobs, match details.

### Phase 6 --- Application tracking

Application records, status pipeline, notes, resume versions.

### Phase 7 --- AI application preparation

Tailored resumes, cover letters, application answers.

### Phase 8 --- Browser agent

Playwright-based assisted application workflow with human approval.

### Phase 9 --- Analytics

Application analytics, interview analytics, source performance.

### Phase 10 --- Learning

Recommendation improvements based on actual application outcomes.

### Phase 11 --- Admin and SaaS

Admin dashboard, source management, AI usage controls, user management,
billing if needed.

## 6. V1 boundary

V1 should NOT attempt to: - automatically submit hundreds of
applications - bypass CAPTCHAs - bypass platform restrictions -
fabricate application information - build microservices - add
Kubernetes - add Elasticsearch before needed - add Redis/BullMQ when
Inngest is sufficient

V1 goal:

**Find good remote jobs → score them accurately → prepare applications →
track them.**

Browser submission comes after the discovery and matching pipeline is
reliable.
