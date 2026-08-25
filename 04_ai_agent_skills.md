# Job Hub --- AI Agent Skills and Capabilities

## Purpose

The AI agent is not one giant prompt.

It is a collection of specialized capabilities operating on verified
structured data.

## 1. Candidate Profiler Skill

The agent must be able to: - read resume text - identify skills -
identify experience - identify projects - identify education - identify
achievements - identify technologies - identify role preferences -
identify explicit location preferences

Output must be structured and validated.

## 2. Resume Truthfulness Skill

The agent must: - distinguish verified facts from inference - never
invent experience - never invent metrics - never invent technologies -
never invent employers - never invent education - never invent
certifications - never invent authorization

If information is missing:

**USER_REQUIRED**

## 3. GitHub Analysis Skill

The agent should understand: - repositories - languages - package
files - README files - project descriptions - technology usage - project
maturity

It should avoid treating: - forks - abandoned experiments - irrelevant
repositories

as strong professional evidence without user confirmation.

## 4. Portfolio Analysis Skill

The agent should: - identify projects - extract technology evidence -
identify features - identify deployment evidence - connect portfolio
projects to candidate profile

## 5. Job Extraction Skill

Given a job page/text, extract: - title - company - location - remote
policy - allowed countries - experience - skills - required skills -
preferred skills - salary - benefits - application URL - posting date -
job status

## 6. Remote Eligibility Skill

Classify jobs as:

``` text
WORLDWIDE_REMOTE
COUNTRY_REMOTE
REGION_REMOTE
HYBRID
ONSITE
UNKNOWN
```

Important:

"Remote" alone must not be interpreted as "worldwide."

## 7. Job Verification Skill

Check: - application URL - active status - posting freshness - location
restrictions - company identity - obvious spam signals

Unknown information should remain unknown.

## 8. Job Deduplication Skill

Compare: - source IDs - URLs - company - title - location -
description - semantic similarity

Do not create duplicate application opportunities for the same job.

## 9. Job Matching Skill

Compare candidate against job on: - hard constraints - required skills -
preferred skills - experience - projects - education - location - remote
eligibility - salary - job freshness

Return: - score 0--10 - recommendation - strengths - gaps - risks -
explanation - confidence

## 10. Match Decision Skill

Rules:

``` text
< 6.0
→ SKIP

6.0–7.9
→ REVIEW

8.0–8.9
→ STRONG_MATCH / PREPARE

9.0–10
→ EXCELLENT_MATCH / HIGH_PRIORITY
```

Hard constraints override the numerical score.

## 11. Resume Tailoring Skill

The agent can: - reorder relevant information - select relevant
projects - rewrite bullets - emphasize matching technologies - shorten
irrelevant sections

The agent cannot create facts.

Every tailored resume must be traceable back to master-resume evidence.

## 12. Cover Letter Skill

Generate concise, job-specific letters based on: - verified candidate
profile - verified projects - job description - company information

Avoid generic AI language and unsupported claims.

## 13. Application Answer Skill

For each question:

``` text
Question
↓
Can verified profile answer it?
├── YES → Generate answer
├── PARTIAL → Draft + request confirmation
└── NO → USER_REQUIRED
```

Never guess sensitive information.

## 14. Browser Agent Skill

The browser agent should understand: - buttons - inputs - textareas -
selects - checkboxes - file uploads - multi-step forms - validation
messages

It should map application fields to verified candidate data.

## 15. Browser Safety Skill

The agent must stop when: - CAPTCHA appears - authentication is required
unexpectedly - work authorization is unknown - salary information is
unknown and required - sensitive questions require user input - form
behavior is ambiguous - website blocks automation - submission state is
uncertain

## 16. Human Approval Skill

Before final submission: - show the complete application - show resume
version - show cover letter - show generated answers - highlight
uncertain fields - allow editing - require explicit approval

## 17. Application Tracking Skill

After successful submission, record: - company - role - job URL -
source - match score - resume version - application documents -
submission time - status - confirmation/reference information

## 18. Follow-up Skill

The agent can recommend: - follow-up dates - interview preparation -
resume improvements - additional applications

It should not spam recruiters automatically.

## 19. Analytics Skill

Analyze: - applications - interviews - offers - rejection rate - source
quality - job type - technology - match score - resume version

## 20. Learning Skill

Learn from outcomes.

Example:

``` text
Role A
20 applications
6 interviews

Role B
20 applications
1 interview
```

Recommend more of Role A.

Do not silently rewrite the user's identity/profile.

## 21. Agent orchestration

The AI system should be divided into specialized agents/functions:

``` text
CandidateProfiler
ResumeVerifier
GitHubAnalyzer
PortfolioAnalyzer

JobExtractor
RemoteVerifier
JobVerifier
JobDeduplicator

JobMatcher
MatchExplainer

ResumeTailor
CoverLetterWriter
ApplicationAnswerer

BrowserAgent
ApplicationReviewer

ApplicationTracker
AnalyticsAgent
RecommendationAgent
```

These should be deterministic services/workflows around AI calls, not
autonomous agents with unrestricted access.

## 22. Skills the developer/AI coding agent must have

The coding AI used to build this project should be strong in:

### Core

-   TypeScript
-   Next.js
-   React
-   Node.js runtime concepts
-   SQL
-   PostgreSQL

### Backend

-   tRPC
-   Zod
-   REST/API concepts
-   authentication
-   authorization
-   webhooks
-   background workflows

### Database

-   Drizzle
-   PostgreSQL indexing
-   transactions
-   relations
-   migrations
-   query optimization

### AI

-   OpenAI APIs
-   structured outputs
-   prompt engineering
-   embeddings
-   pgvector
-   RAG concepts
-   evaluation
-   hallucination prevention

### Automation

-   Playwright
-   DOM inspection
-   form automation
-   browser sessions
-   retries
-   failure recovery

### Infrastructure

-   Docker
-   environment variables
-   Vercel
-   Neon
-   Cloudflare R2
-   Inngest

### Engineering

-   unit testing
-   integration testing
-   end-to-end testing
-   security
-   rate limiting
-   error handling
-   observability
-   idempotency
-   concurrency

## 23. Non-negotiable AI engineering rules

1.  Never trust raw LLM output.
2.  Validate structured AI output with Zod.
3.  Store source evidence for important candidate/job facts.
4.  Separate hard constraints from AI scoring.
5.  Never let AI invent candidate information.
6.  Never automatically submit without the defined approval policy.
7.  Make workflows idempotent.
8.  Log important AI decisions.
9.  Make match scores explainable.
10. Keep the master resume immutable.
11. Treat application data as user-controlled.
12. Respect target websites' terms and automation restrictions.
13. Prefer deterministic code over AI when a deterministic rule is
    sufficient.
14. Use AI for interpretation and generation, not for simple validation
    that code can perform reliably.
15. Every automated action should have a recoverable state.

## 24. Definition of a good AI agent

A good agent is not the one that does everything without asking.

A good agent is the one that:

**does the repetitive work automatically, knows what it does not know,
stops when user input is required, and leaves an auditable trail of what
happened.**
