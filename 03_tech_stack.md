# Job Hub --- Final Tech Stack

## Core decision

Use a **TypeScript-first monolith/monorepo**.

Do not start with microservices.

## 1. Application

### Next.js

Purpose: - frontend - backend - route handlers - server-side rendering -
dashboard - API surface

### React

Purpose: - interactive UI

### TypeScript

Purpose: - entire application codebase

## 2. UI

### Tailwind CSS

Purpose: - styling

### shadcn/ui

Purpose: - reusable accessible UI components

### Framer Motion

Purpose: - controlled UI animation

Do not overuse animation in productivity screens.

## 3. API and validation

### tRPC

Purpose: - type-safe application API

### Zod

Purpose: - validate: - API input - AI output - extracted job data -
candidate profile data

## 4. Database

### PostgreSQL

Purpose: - users - candidate profiles - jobs - matches - applications -
resumes - analytics

### Drizzle ORM

Purpose: - PostgreSQL schema and queries

### Decision: Drizzle over Prisma

Use one ORM only.

For this project, choose Drizzle because: - TypeScript-first -
PostgreSQL-friendly - lightweight - strong SQL control - already
familiar to the developer - fits the project's need for relational
queries and explicit schemas

## 5. Background workflows

### Inngest

Purpose: - scheduled job discovery - resume processing - AI processing -
retries - durable workflows - application preparation - follow-ups -
analytics jobs

### Do not initially use

-   BullMQ
-   Redis queue
-   custom worker server

Add another queue system only if a measured requirement appears.

## 6. AI

### OpenAI API

Purpose: - candidate profiling - job extraction - job evaluation -
matching explanations - resume tailoring - cover letters - application
answers

Use structured outputs and Zod validation.

### Embeddings

Use PostgreSQL + pgvector initially for semantic matching.

Do not introduce a separate vector database unless scale requires it.

## 7. Browser automation

### Playwright

Purpose: - assisted application form filling - navigation - file
upload - application state detection - screenshots/debugging

Use only where permitted and technically appropriate.

## 8. Authentication

### Better Auth

Purpose: - account creation - login - sessions - Google authentication -
GitHub authentication

## 9. GitHub integration

### GitHub OAuth/API

Purpose: - selected repository analysis - technologies - README/project
evidence - verified project profile

Do not automatically treat every GitHub repository as professional
experience.

## 10. File storage

### Cloudflare R2

Purpose: - original resumes - tailored resumes - generated documents -
application documents

Store metadata in PostgreSQL.

## 11. Deployment

### Vercel

Use for: - Next.js application

### Neon

Use for: - PostgreSQL

### Inngest

Use for: - background workflow execution

### Cloudflare R2

Use for: - file storage

### Docker

Use for: - local PostgreSQL/development consistency -
browser/development environments where useful

Do not begin with AWS infrastructure.

## 12. Monitoring

### Sentry

Purpose: - frontend errors - backend errors - workflow errors -
production debugging

## 13. Repository

### pnpm

Package manager.

### Turborepo

Monorepo orchestration.

## 14. Final stack in one line

**Next.js + React + TypeScript + Tailwind + shadcn/ui + tRPC + Zod +
PostgreSQL + Drizzle + Inngest + OpenAI + pgvector + Playwright + Better
Auth + GitHub API + Cloudflare R2 + Vercel + Neon + Docker + Sentry**

## 15. Explicitly rejected for V1

-   Express backend
-   separate Node.js backend
-   Python backend
-   Redis/BullMQ
-   Kubernetes
-   microservices
-   Elasticsearch/OpenSearch
-   separate vector database
-   AWS-first deployment

These can be introduced only when a concrete requirement justifies them.
