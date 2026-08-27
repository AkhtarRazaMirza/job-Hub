import type { PortfolioCrawler, PortfolioCrawlResult } from "./types";
import { PortfolioError } from "./types";
import { validatePortfolioUrl } from "./ssrf-validator";

export class MockPortfolioCrawler implements PortfolioCrawler {
  private fixtures: Map<string, PortfolioCrawlResult> = new Map();

  constructor(fixtures?: PortfolioCrawlResult[]) {
    if (fixtures) {
      for (const f of fixtures) {
        this.addFixture(f);
      }
    }
  }

  addFixture(fixture: PortfolioCrawlResult): void {
    const valid = validatePortfolioUrl(fixture.url);
    this.fixtures.set(valid.toString().toLowerCase(), fixture);
  }

  async crawl(url: string): Promise<PortfolioCrawlResult> {
    const valid = validatePortfolioUrl(url);
    const key = valid.toString().toLowerCase();
    const fixture = this.fixtures.get(key);

    if (!fixture) {
      throw new PortfolioError(`Portfolio URL "${url}" not found in mock fixtures.`, "NOT_FOUND");
    }

    return fixture;
  }
}
