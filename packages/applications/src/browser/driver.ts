/**
 * Job Hub — Phase 8 / Step 8.4
 * Browser Driver Contract & Simulated Test Driver
 *
 * Implements Playwright-compatible browser interaction primitives with
 * strict sandboxing, test fixture simulation, and deterministic form filling.
 */

import type { InspectedInputField } from "./types";

export interface BrowserNavigationResult {
  status: number;
  url: string;
}

export interface BrowserSubmissionResult {
  success: boolean;
  navigatedUrl?: string;
  confirmationText?: string;
  uncertain?: boolean;
  errorMessage?: string;
}

export interface BrowserDriver {
  goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<BrowserNavigationResult>;
  getTitle(): Promise<string>;
  getUrl(): Promise<string>;
  getContent(): Promise<string>;
  getStatus(): Promise<number>;
  inspectInputs(): Promise<InspectedInputField[]>;
  fillField(selector: string, value: string): Promise<boolean>;
  selectOption(selector: string, value: string): Promise<boolean>;
  checkField(selector: string, checked?: boolean): Promise<boolean>;
  uploadFile(selector: string, fileName: string, fileBuffer: Buffer, mimeType: string): Promise<boolean>;
  clickSubmit(selector?: string): Promise<BrowserSubmissionResult>;
  takeScreenshot?(): Promise<string>;
  close(): Promise<void>;
}

export interface SimulatedDriverConfig {
  initialUrl?: string;
  title?: string;
  html?: string;
  status?: number;
  inputs?: InspectedInputField[];
  simulateCaptcha?: boolean;
  simulateAuthWall?: boolean;
  simulateMfa?: boolean;
  simulateBlocked?: boolean;
  simulateRedirectUrl?: string;
  simulateSubmissionSuccess?: boolean;
  simulateSubmissionUncertain?: boolean;
  submissionConfirmationText?: string;
  uploadShouldFail?: boolean;
}

export const DEFAULT_SIMULATED_INPUTS: InspectedInputField[] = [
  {
    id: "first_name",
    name: "first_name",
    selector: 'input[name="first_name"]',
    type: "text",
    label: "First Name",
    required: true,
  },
  {
    id: "last_name",
    name: "last_name",
    selector: 'input[name="last_name"]',
    type: "text",
    label: "Last Name",
    required: true,
  },
  {
    id: "email",
    name: "email",
    selector: 'input[name="email"]',
    type: "text",
    label: "Email Address",
    required: true,
  },
  {
    id: "resume",
    name: "resume",
    selector: 'input[type="file"][name="resume"]',
    type: "file",
    label: "Resume / CV",
    required: true,
  },
];

/**
 * High-fidelity, deterministic simulated browser driver for controlled testing
 * and sandboxed environment execution.
 */
export class SimulatedBrowserDriver implements BrowserDriver {
  private currentUrl: string;
  private currentTitle: string;
  private currentHtml: string;
  private currentStatus: number;
  private inputs: InspectedInputField[];
  private filledValues: Map<string, string> = new Map();
  private uploadedFiles: Map<string, { fileName: string; size: number }> = new Map();
  private config: SimulatedDriverConfig;
  private closed = false;

  constructor(config: SimulatedDriverConfig = {}) {
    this.config = config;
    this.currentUrl = config.initialUrl || "about:blank";
    this.currentTitle = config.title || "Job Application Form";
    this.currentHtml =
      config.html ||
      '<html><body><form action="/apply"><label for="first_name">First Name</label><input id="first_name" name="first_name"/><label for="last_name">Last Name</label><input id="last_name" name="last_name"/><label for="email">Email</label><input id="email" name="email"/><label for="resume">Resume</label><input id="resume" type="file" name="resume"/></form></body></html>';
    this.currentStatus = config.status || 200;
    this.inputs = config.inputs ? [...config.inputs] : [...DEFAULT_SIMULATED_INPUTS];
  }

  async goto(url: string): Promise<BrowserNavigationResult> {
    if (this.closed) throw new Error("Browser driver is closed");

    if (this.config.simulateRedirectUrl) {
      this.currentUrl = this.config.simulateRedirectUrl;
    } else {
      this.currentUrl = url;
    }

    if (this.config.simulateBlocked) {
      this.currentStatus = 403;
      this.currentHtml = "<div>Cloudflare Ray ID: 99999 Access Denied</div>";
    } else if (this.config.simulateCaptcha) {
      this.currentHtml = "<div>Please complete the captcha to verify you are human</div>";
    } else if (this.config.simulateAuthWall) {
      this.currentHtml = "<div>Please sign in to apply for this position</div>";
    } else if (this.config.simulateMfa) {
      this.currentHtml = "<div>Enter two-factor authentication code</div>";
    }

    return {
      status: this.currentStatus,
      url: this.currentUrl,
    };
  }

  async getTitle(): Promise<string> {
    return this.currentTitle;
  }

  async getUrl(): Promise<string> {
    return this.currentUrl;
  }

  async getContent(): Promise<string> {
    return this.currentHtml;
  }

  async getStatus(): Promise<number> {
    return this.currentStatus;
  }

  async inspectInputs(): Promise<InspectedInputField[]> {
    return this.inputs;
  }

  async fillField(selector: string, value: string): Promise<boolean> {
    const input = this.inputs.find((i) => i.selector === selector || i.name === selector);
    if (!input) return false;

    input.currentValue = value;
    this.filledValues.set(selector, value);
    return true;
  }

  async selectOption(selector: string, value: string): Promise<boolean> {
    const input = this.inputs.find((i) => i.selector === selector || i.name === selector);
    if (!input) return false;

    input.currentValue = value;
    this.filledValues.set(selector, value);
    return true;
  }

  async checkField(selector: string, checked = true): Promise<boolean> {
    const input = this.inputs.find((i) => i.selector === selector || i.name === selector);
    if (!input) return false;

    input.currentValue = checked ? "true" : "false";
    this.filledValues.set(selector, input.currentValue);
    return true;
  }

  async uploadFile(
    selector: string,
    fileName: string,
    fileBuffer: Buffer,
    _mimeType: string
  ): Promise<boolean> {
    if (this.config.uploadShouldFail) {
      return false;
    }

    const input = this.inputs.find((i) => i.selector === selector || i.name === selector);
    if (!input || input.type !== "file") return false;

    input.currentValue = fileName;
    this.uploadedFiles.set(selector, { fileName, size: fileBuffer.length });
    return true;
  }

  async clickSubmit(_selector?: string): Promise<BrowserSubmissionResult> {
    if (this.config.simulateSubmissionUncertain) {
      return {
        success: false,
        uncertain: true,
        errorMessage: "Network timed out during form submission; status uncertain.",
      };
    }

    if (this.config.simulateSubmissionSuccess === false) {
      return {
        success: false,
        uncertain: false,
        errorMessage: "Form validation error occurred on page.",
      };
    }

    // Default success
    return {
      success: true,
      navigatedUrl: `${this.currentUrl}/thank-you`,
      confirmationText:
        this.config.submissionConfirmationText ||
        "Thank you! Your application has been submitted successfully.",
    };
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  getFilledValue(selector: string): string | undefined {
    return this.filledValues.get(selector);
  }

  getUploadedFile(selector: string): { fileName: string; size: number } | undefined {
    return this.uploadedFiles.get(selector);
  }
}
