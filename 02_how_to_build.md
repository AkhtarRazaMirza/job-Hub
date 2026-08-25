# Job Hub --- How to Build It

## 1. Repository structure

Use a TypeScript monorepo with Turborepo and pnpm.

``` text
job-hub/
├── apps/
│   ├── web/
│   └── admin/
├── packages/
│   ├── db/
│   ├── auth/
│   ├── ai/
│   ├── jobs/
│   ├── matching/
│   ├── candidate/
│   ├── resume/
│   ├── applications/
│   ├── storage/
│   ├── browser/
│   └── shared/
├── inngest/
│   ├── functions/
│   └── events/
├── tests/
├── docker/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

Keep the initial implementation modular without splitting into
microservices.

## 2. Build the foundation first

Create: - Next.js app - TypeScript - Tailwind - shadcn/ui - Better
Auth - PostgreSQL - Drizzle - environment configuration - error
handling - logging - basic testing

Create database entities for: - users - candidate_profiles -
candidate_preferences - skills - projects - experiences - education -
achievements - resumes - jobs - job_sources - job_matches -
applications - application_documents - application_answers -
application_events

## 3. Candidate ingestion

Create a resume ingestion workflow:

``` text
Upload Resume
→ Store file
→ Extract text
→ Normalize text
→ AI structured extraction
→ Validate with Zod
→ Save candidate profile
```

Add GitHub:

``` text
GitHub OAuth
→ Fetch selected repositories
→ Analyze README/languages/metadata
→ Extract verified project information
→ User confirms
→ Save
```

Add portfolio:

``` text
Portfolio URL
→ Controlled fetch/crawl
→ Extract project information
→ AI structure
→ User confirmation
→ Save
```

## 4. Use Inngest for workflows

Do not create a custom worker/queue system initially.

Use Inngest for: - resume processing - GitHub analysis - portfolio
analysis - scheduled job discovery - job normalization - job
deduplication - AI job analysis - match scoring - resume generation -
application preparation - follow-up reminders - analytics jobs

Example conceptual workflow:

``` text
job.discovered
→ normalize
→ verify
→ deduplicate
→ analyze
→ match candidate
→ save score
```

Use retries, idempotency and step boundaries so the same event does not
create duplicate jobs or applications.

## 5. Job source architecture

Create a common source interface.

``` text
JobSource
├── discover()
├── normalize()
├── getApplicationUrl()
└── verifyStatus()
```

Each source adapter converts its data into one internal Job schema.

Start with sources that have legitimate API/feed/public-career-page
access.

Do not hard-code the application flow for every website into the core
job system.

## 6. Job normalization

Convert every source into one structure:

``` text
Job
├── title
├── company
├── description
├── requirements
├── skills
├── experience
├── salary
├── currency
├── location
├── remoteType
├── allowedCountries
├── postedAt
├── applicationUrl
├── source
├── sourceJobId
└── status
```

## 7. Deduplication

Use deterministic checks first: - source job ID - canonical application
URL - company + title + normalized location

Then use semantic similarity for harder duplicates.

Do not rely on an LLM alone for deduplication.

## 8. AI matching

First perform deterministic filtering:

``` text
Remote eligibility
Country eligibility
Experience
Required skills
Application status
Job freshness
```

Then perform semantic/AI evaluation.

Store the score and explanation.

The score should be reproducible enough to audit.

## 9. Matching model

Use a weighted score such as:

``` text
Skills             30%
Experience         20%
Remote/location    20%
Projects           10%
Education          10%
Salary             5%
Job freshness      5%
```

These weights are initial defaults, not permanent truth.

Keep the scoring system configurable.

Hard constraints should override the score.

Example:

``` text
Job is US-only
Candidate requires worldwide remote
→ Reject regardless of skill score
```

## 10. Dashboard

Build these screens:

``` text
Dashboard
Jobs
Job Details
Saved Jobs
Applications
Application Details
Resume Versions
Candidate Profile
Analytics
Settings
```

Job details should show: - match score - why it matches - gaps - remote
eligibility - salary - source - application URL - application status

## 11. Resume tailoring

Maintain a master resume.

Never mutate it.

For each job:

``` text
Master Resume
+
Job Description
↓
AI selection/rewrite
↓
Tailored Resume JSON
↓
Validation
↓
PDF/DOCX generation
↓
Version saved
```

The tailoring engine may: - reorder sections - select relevant
projects - rewrite bullets - emphasize matching skills

It may not: - invent metrics - invent responsibilities - invent
technologies - invent employers - invent achievements

## 12. Application preparation

Generate: - cover letter - application answers - short recruiter
message - structured field values

Every generated answer should carry a source/confidence classification:

``` text
VERIFIED
INFERRED
USER_REQUIRED
```

Anything requiring user confirmation should block automatic submission.

## 13. Browser agent

Use Playwright only after the preparation pipeline is stable.

Flow:

``` text
Prepared Application
→ Open application URL
→ Detect form
→ Map fields
→ Fill verified fields
→ Upload approved resume
→ Insert prepared answers
→ Detect uncertain/sensitive fields
→ Pause
→ User review
→ User approval
→ Submit if permitted
→ Capture confirmation
→ Save application
```

Do not build a universal "works on every website" agent.

Build an adapter strategy where necessary and respect the target site's
rules.

## 14. Application tracker

Create an application record immediately when the user decides to apply.

Store: - job ID - company - role - source - match score - resume
version - cover letter version - answers - submittedAt - status - next
action - follow-up date - notes - confirmation/reference data when
available

## 15. Analytics

Calculate: - total applications - applications by source - applications
by role - interview rate - response rate - offer rate - average match
score of applications - score vs interview conversion - resume version
performance

## 16. Learning engine

Do not let the AI randomly change the user's profile.

Instead, learn from outcomes:

``` text
Jobs applied
→ interviews
→ offers
```

Find patterns.

Example:

``` text
AI Full-Stack:
20 applications
6 interviews

Frontend-only:
20 applications
1 interview
```

Recommendation:

"AI full-stack roles are currently producing better interview results."

The user remains able to override recommendations.

## 17. Testing strategy

Write tests for: - job normalization - deduplication - remote
classification - hard constraints - scoring - AI schema validation -
resume truthfulness rules - application state transitions - duplicate
application prevention

Browser automation should have dedicated integration tests.

## 18. Build order

Do not build the browser agent first.

Build:

``` text
1. Foundation
2. Auth
3. Candidate profile
4. Resume ingestion
5. GitHub/portfolio ingestion
6. Job ingestion
7. Normalization
8. Verification
9. Deduplication
10. Matching
11. Dashboard
12. Application tracker
13. Resume tailoring
14. Application preparation
15. Browser agent
16. Analytics
17. Learning
18. Admin
```

At every phase, keep the application deployable.
