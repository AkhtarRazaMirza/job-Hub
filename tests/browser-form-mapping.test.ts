/**
 * Job Hub — Phase 8 / Step 8.3
 * Form Inspector & Candidate Data Mapping Engine Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  detectApplicationForm,
  mapFormFields,
  type InspectedInputField,
  type BrowserPageState,
  type CandidateFormContext,
  type CandidateFormFillingProfile,
  type ApplicationPreparationPackage,
} from "@job-hub/applications";

test("Phase 8 / Step 8.3 — Form Inspector & Candidate Data Mapping Engine Suite", async (t) => {
  const sampleProfile: CandidateFormFillingProfile = {
    name: "Alex Mercer",
    firstName: "Alex",
    lastName: "Mercer",
    email: "alex.mercer@example.com",
    phone: "+1-555-0199",
    location: "San Francisco, CA",
    city: "San Francisco",
    country: "USA",
    headline: "Staff Software Engineer",
    summary: "10+ years of distributed systems experience.",
    linkedinUrl: "https://linkedin.com/in/alexmercer",
    githubUrl: "https://github.com/alexmercer",
    portfolioUrl: "https://alexmercer.dev",
  };

  const samplePackage: ApplicationPreparationPackage = {
    applicationId: "app_sample_1",
    candidateProfileId: "cand_sample_1",
    jobId: "job_sample_1",
    job: {
      id: "job_sample_1",
      title: "Senior Backend Engineer",
      company: "Acme Cloud",
      location: "Remote",
      remoteType: "WORLDWIDE_REMOTE",
      skills: ["TypeScript", "Node.js", "PostgreSQL"],
    },
    tailoredResume: {
      id: "tailored_res_1",
      candidateProfileId: "cand_sample_1",
      jobId: "job_sample_1",
      version: 1,
      targetRole: "Senior Backend Engineer",
      targetCompany: "Acme Cloud",
      summary: "Tailored summary for Acme Cloud",
      skills: ["TypeScript", "PostgreSQL"],
      experiences: [],
      projects: [],
      education: [],
      status: "APPROVED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    resumeDocument: {
      storageKey: "resumes/cand_sample_1/tailored_res_1.pdf",
      mimeType: "application/pdf",
    },
    coverLetter: {
      id: "cl_1",
      candidateProfileId: "cand_sample_1",
      jobId: "job_sample_1",
      version: 1,
      targetCompany: "Acme Cloud",
      targetRole: "Senior Backend Engineer",
      content: "Dear Acme Hiring Team, I am thrilled to apply...",
      status: "APPROVED",
      isApproved: true,
      userNotes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    answers: [
      {
        id: "ans_1",
        applicationId: "app_sample_1",
        candidateProfileId: "cand_sample_1",
        question: "How many years of TypeScript experience do you have?",
        answer: "I have 6 years of professional experience with TypeScript.",
        confidence: "VERIFIED",
        sourceEvidence: "resume work experience",
        isConfirmed: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "ans_2",
        applicationId: "app_sample_1",
        candidateProfileId: "cand_sample_1",
        question: "Have you led engineering teams in high-growth environments?",
        answer: "Yes, I led a team of 5 backend engineers at a series B startup.",
        confidence: "INFERRED",
        sourceEvidence: "resume leadership bullet",
        isConfirmed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "ans_3",
        applicationId: "app_sample_1",
        candidateProfileId: "cand_sample_1",
        question: "What is your target base salary?",
        answer: "$180,000 USD",
        confidence: "USER_REQUIRED",
        sourceEvidence: null,
        isConfirmed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    status: "PREPARED",
    hasUserRequiredFields: true,
    unconfirmedCount: 2,
    isApproved: false,
  };

  await t.test("1. Form Detection: Accurately identifies application forms vs generic pages", () => {
    // Application page with standard inputs
    const appPageState: BrowserPageState = {
      url: "https://boards.greenhouse.io/acme/jobs/123",
      title: "Apply for Senior Backend Engineer",
      domain: "boards.greenhouse.io",
      inputs: [
        { selector: "input[name='first_name']", name: "first_name", label: "First Name", type: "text" },
        { selector: "input[name='email']", name: "email", label: "Email", type: "text" },
        { selector: "input[name='resume']", name: "resume", label: "Resume/CV", type: "file" },
        { selector: "button[type='submit']", label: "Submit Application", type: "button" },
      ],
    };

    const detect1 = detectApplicationForm(appPageState);
    assert.equal(detect1.formDetected, true);
    assert.ok(detect1.confidence >= 0.7);
    assert.ok(detect1.indicators.includes("name_field"));
    assert.ok(detect1.indicators.includes("email_field"));
    assert.ok(detect1.indicators.includes("resume_upload_field"));

    // Empty page
    const emptyPageState: BrowserPageState = {
      url: "https://example.com/about",
      title: "About Us",
      domain: "example.com",
      inputs: [],
    };
    const detect2 = detectApplicationForm(emptyPageState);
    assert.equal(detect2.formDetected, false);
    assert.equal(detect2.confidence, 0);
  });

  await t.test("2. Candidate Data Mapping: Maps standard profile fields deterministically", () => {
    const inputs: InspectedInputField[] = [
      { selector: "input[name='first_name']", name: "first_name", label: "First Name", type: "text" },
      { selector: "input[name='last_name']", name: "last_name", label: "Last Name", type: "text" },
      { selector: "input[name='email']", name: "email", label: "Email Address", type: "text" },
      { selector: "input[name='phone']", name: "phone", label: "Phone Number", type: "text" },
      { selector: "input[name='linkedin']", name: "linkedin", label: "LinkedIn Profile", type: "text" },
      { selector: "input[name='github']", name: "github", label: "GitHub Profile", type: "text" },
      { selector: "input[name='website']", name: "website", label: "Personal Portfolio", type: "text" },
      { selector: "input[name='location']", name: "location", label: "Current Location", type: "text" },
    ];

    const context: CandidateFormContext = {
      profile: sampleProfile,
    };

    const res = mapFormFields(inputs, context);
    assert.equal(res.formDetected, true);
    assert.equal(res.fieldMappings.length, 8);
    assert.equal(res.knownCount, 8);
    assert.equal(res.requiresUserInput, false);

    // Verify individual field values
    const fn = res.fieldMappings.find((m) => m.semanticType === "first_name");
    assert.equal(fn?.value, "Alex");
    assert.equal(fn?.confidence, "VERIFIED");

    const em = res.fieldMappings.find((m) => m.semanticType === "email");
    assert.equal(em?.value, "alex.mercer@example.com");

    const gh = res.fieldMappings.find((m) => m.semanticType === "github_url");
    assert.equal(gh?.value, "https://github.com/alexmercer");
  });

  await t.test("3. Documents Mapping: Maps approved resume document and cover letter", () => {
    const inputs: InspectedInputField[] = [
      { selector: "input[name='resume']", name: "resume", label: "Attach Resume / CV", type: "file" },
      { selector: "textarea[name='cover_letter']", name: "cover_letter", label: "Cover Letter", type: "textarea" },
    ];

    const context: CandidateFormContext = {
      profile: sampleProfile,
      preparationPackage: samplePackage,
    };

    const res = mapFormFields(inputs, context);
    assert.equal(res.documentsToUpload.length, 1);
    assert.equal(res.documentsToUpload[0]?.documentType, "RESUME");
    assert.equal(res.documentsToUpload[0]?.documentId, "tailored_res_1");

    const resumeMapping = res.fieldMappings.find((m) => m.semanticType === "resume_upload");
    assert.equal(resumeMapping?.classification, "KNOWN");
    assert.equal(resumeMapping?.value, "resumes/cand_sample_1/tailored_res_1.pdf");

    const clMapping = res.fieldMappings.find((m) => m.semanticType === "cover_letter");
    assert.equal(clMapping?.classification, "KNOWN");
    assert.equal(clMapping?.value, samplePackage.coverLetter.content);
  });

  await t.test("4. Answers Confidence Gate: VERIFIED is filled; INFERRED & USER_REQUIRED require review", () => {
    const inputs: InspectedInputField[] = [
      {
        selector: "input[name='q_typescript']",
        label: "How many years of TypeScript experience do you have?",
        type: "text",
      },
      {
        selector: "textarea[name='q_leadership']",
        label: "Have you led engineering teams in high-growth environments?",
        type: "textarea",
      },
      {
        selector: "input[name='q_salary']",
        label: "What is your target base salary?",
        type: "text",
      },
    ];

    const context: CandidateFormContext = {
      profile: sampleProfile,
      preparationPackage: samplePackage,
    };

    const res = mapFormFields(inputs, context);

    // Q1: VERIFIED -> KNOWN, requiresUserInput: false
    const q1 = res.fieldMappings.find((m) => m.label?.includes("TypeScript"));
    assert.equal(q1?.classification, "KNOWN");
    assert.equal(q1?.value, "I have 6 years of professional experience with TypeScript.");
    assert.equal(q1?.requiresUserInput, false);

    // Q2: INFERRED -> AMBIGUOUS, requiresUserInput: true
    const q2 = res.fieldMappings.find((m) => m.label?.includes("led engineering teams"));
    assert.equal(q2?.classification, "AMBIGUOUS");
    assert.equal(q2?.requiresUserInput, true);
    assert.equal(q2?.confidence, "INFERRED");

    // Q3: USER_REQUIRED (and salary topic) -> UNSAFE, requiresUserInput: true
    const q3 = res.fieldMappings.find((m) => m.label?.includes("salary"));
    assert.equal(q3?.classification, "UNSAFE");
    assert.equal(q3?.requiresUserInput, true);
    assert.equal(q3?.confidence, "USER_REQUIRED");

    // Overall form requires user input
    assert.equal(res.requiresUserInput, true);
  });

  await t.test("5. Sensitive Topics & Explicit Overrides: Unconfirmed sensitive questions pause; overrides pass", () => {
    const inputs: InspectedInputField[] = [
      {
        selector: "input[name='visa_sponsorship']",
        name: "visa_sponsorship",
        label: "Do you require visa sponsorship now or in the future?",
        type: "radio",
      },
      {
        selector: "select[name='gender']",
        name: "gender",
        label: "Gender Identity (Optional)",
        type: "select",
      },
      {
        selector: "input[name='criminal_record']",
        name: "criminal_record",
        label: "Do you have any criminal convictions?",
        type: "checkbox",
      },
    ];

    // Scenario A: Without explicit overrides -> all 3 are UNSAFE
    const resA = mapFormFields(inputs, { profile: sampleProfile });
    assert.equal(resA.unsafeCount, 3);
    assert.equal(resA.requiresUserInput, true);
    assert.equal(resA.fieldMappings[0]?.classification, "UNSAFE");
    assert.equal(resA.fieldMappings[1]?.classification, "UNSAFE");
    assert.equal(resA.fieldMappings[2]?.classification, "UNSAFE");

    // Scenario B: With explicit candidate override for visa sponsorship
    const resB = mapFormFields(inputs, {
      profile: sampleProfile,
      explicitOverrides: {
        visa_sponsorship: "No",
      },
    });
    assert.equal(resB.fieldMappings[0]?.classification, "KNOWN");
    assert.equal(resB.fieldMappings[0]?.value, "No");
    assert.equal(resB.fieldMappings[0]?.requiresUserInput, false);
    // Other sensitive questions still require input
    assert.equal(resB.fieldMappings[1]?.classification, "UNSAFE");
  });

  await t.test("6. Truthfulness Invariant: Profile missing fields are not fabricated", () => {
    // Candidate profile with no phone and no website
    const sparseProfile: CandidateFormFillingProfile = {
      name: "Jordan Lee",
      email: "jordan@example.com",
      phone: null,
      portfolioUrl: null,
    };

    const inputs: InspectedInputField[] = [
      { selector: "input[name='email']", name: "email", label: "Email", type: "text" },
      { selector: "input[name='phone']", name: "phone", label: "Phone", type: "text" },
      { selector: "input[name='portfolio']", name: "portfolio", label: "Portfolio URL", type: "text" },
    ];

    const res = mapFormFields(inputs, { profile: sparseProfile });
    const phoneField = res.fieldMappings.find((m) => m.semanticType === "phone");
    assert.equal(phoneField?.classification, "UNKNOWN");
    assert.equal(phoneField?.value, undefined);
    assert.equal(phoneField?.requiresUserInput, true);
    assert.match(phoneField?.reason!, /Candidate profile does not contain value/);
  });
});
