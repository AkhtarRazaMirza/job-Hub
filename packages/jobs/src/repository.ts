import { eq, and, desc } from "drizzle-orm";
import {
  db as defaultDb,
  jobs as jobsTable,
  jobSources as jobSourcesTable,
  type Database,
} from "@job-hub/db";
import type {
  Job,
  JobSource,
  CreateJobInput,
  UpdateJobInput,
  CreateJobSourceInput,
  UpdateJobSourceInput,
  JobFilter,
} from "./types";
import {
  JobNotFoundError,
  JobSourceNotFoundError,
  JobSourceConflictError,
} from "./errors";

export interface JobSourceRepository {
  findById(id: string): Promise<JobSource | null>;
  findByName(name: string): Promise<JobSource | null>;
  create(input: CreateJobSourceInput): Promise<JobSource>;
  update(id: string, input: UpdateJobSourceInput): Promise<JobSource>;
  listActive(): Promise<JobSource[]>;
  listAll(): Promise<JobSource[]>;
  delete(id: string): Promise<boolean>;
}

export interface JobRepository {
  findById(id: string): Promise<Job | null>;
  findBySourceAndSourceJobId(source: string, sourceJobId: string): Promise<Job | null>;
  findByCanonicalUrl(canonicalUrl: string): Promise<Job | null>;
  findByApplicationUrl(applicationUrl: string): Promise<Job | null>;
  findByCompany(company: string): Promise<Job[]>;
  create(input: CreateJobInput): Promise<Job>;
  update(id: string, input: UpdateJobInput): Promise<Job>;
  list(filter?: JobFilter): Promise<Job[]>;
  delete(id: string): Promise<boolean>;
}

export class DrizzleJobSourceRepository implements JobSourceRepository {
  constructor(private readonly db: Database = defaultDb) {}

  private toEntity(row: typeof jobSourcesTable.$inferSelect): JobSource {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      url: row.url ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<JobSource | null> {
    const [row] = await this.db
      .select()
      .from(jobSourcesTable)
      .where(eq(jobSourcesTable.id, id))
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async findByName(name: string): Promise<JobSource | null> {
    const [row] = await this.db
      .select()
      .from(jobSourcesTable)
      .where(eq(jobSourcesTable.name, name))
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async create(input: CreateJobSourceInput): Promise<JobSource> {
    try {
      const [created] = await this.db
        .insert(jobSourcesTable)
        .values({
          id: input.id,
          name: input.name,
          type: input.type,
          url: input.url ?? null,
          isActive: input.isActive ?? true,
        })
        .returning();

      return this.toEntity(created!);
    } catch (error: unknown) {
      const isUniqueViolation =
        (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") ||
        (error && typeof error === "object" && "cause" in error && (error as { cause: { code?: string } }).cause?.code === "23505") ||
        (error instanceof Error && (error.message.includes("23505") || error.message.includes("unique constraint")));

      if (isUniqueViolation) {
        throw new JobSourceConflictError(`Job source with name "${input.name}" already exists.`);
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateJobSourceInput): Promise<JobSource> {
    const valuesToUpdate: Partial<typeof jobSourcesTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) valuesToUpdate.name = input.name;
    if (input.type !== undefined) valuesToUpdate.type = input.type;
    if (input.url !== undefined) valuesToUpdate.url = input.url;
    if (input.isActive !== undefined) valuesToUpdate.isActive = input.isActive;

    const [updated] = await this.db
      .update(jobSourcesTable)
      .set(valuesToUpdate)
      .where(eq(jobSourcesTable.id, id))
      .returning();

    if (!updated) {
      throw new JobSourceNotFoundError(`Job source with ID "${id}" not found.`);
    }

    return this.toEntity(updated);
  }

  async listActive(): Promise<JobSource[]> {
    const rows = await this.db
      .select()
      .from(jobSourcesTable)
      .where(eq(jobSourcesTable.isActive, true))
      .orderBy(desc(jobSourcesTable.createdAt));

    return rows.map((r) => this.toEntity(r));
  }

  async listAll(): Promise<JobSource[]> {
    const rows = await this.db
      .select()
      .from(jobSourcesTable)
      .orderBy(desc(jobSourcesTable.createdAt));

    return rows.map((r) => this.toEntity(r));
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(jobSourcesTable)
      .where(eq(jobSourcesTable.id, id))
      .returning({ id: jobSourcesTable.id });

    return result.length > 0;
  }
}

export class DrizzleJobRepository implements JobRepository {
  constructor(private readonly db: Database = defaultDb) {}

  private toEntity(row: typeof jobsTable.$inferSelect): Job {
    return {
      id: row.id,
      source: row.source,
      sourceJobId: row.sourceJobId ?? null,
      jobSourceId: row.jobSourceId ?? null,
      canonicalUrl: row.canonicalUrl ?? null,
      title: row.title,
      company: row.company,
      location: row.location ?? null,
      remoteType: row.remoteType,
      allowedCountries: (row.allowedCountries as string[]) || [],
      salary: row.salary ?? null,
      salaryMin: row.salaryMin ?? null,
      salaryMax: row.salaryMax ?? null,
      currency: row.currency ?? null,
      experience: row.experience ?? null,
      skills: (row.skills as string[]) || [],
      requirements: (row.requirements as string[]) || [],
      description: row.description ?? null,
      applicationUrl: row.applicationUrl,
      status: row.status,
      postedAt: row.postedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<Job | null> {
    const [row] = await this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, id))
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async findBySourceAndSourceJobId(
    source: string,
    sourceJobId: string
  ): Promise<Job | null> {
    const [row] = await this.db
      .select()
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.source, source),
          eq(jobsTable.sourceJobId, sourceJobId)
        )
      )
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async findByCanonicalUrl(canonicalUrl: string): Promise<Job | null> {
    const [row] = await this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.canonicalUrl, canonicalUrl))
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async findByApplicationUrl(applicationUrl: string): Promise<Job | null> {
    const [row] = await this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.applicationUrl, applicationUrl))
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async findByCompany(company: string): Promise<Job[]> {
    const rows = await this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.company, company))
      .limit(50);

    return rows.map((r) => this.toEntity(r));
  }

  async create(input: CreateJobInput): Promise<Job> {
    const [created] = await this.db
      .insert(jobsTable)
      .values({
        id: input.id,
        source: input.source,
        sourceJobId: input.sourceJobId ?? null,
        jobSourceId: input.jobSourceId ?? null,
        canonicalUrl: input.canonicalUrl ?? null,
        title: input.title,
        company: input.company,
        location: input.location ?? null,
        remoteType: input.remoteType ?? "UNKNOWN",
        allowedCountries: input.allowedCountries ?? [],
        salary: input.salary ?? input.salaryMin ?? null,
        salaryMin: input.salaryMin ?? input.salary ?? null,
        salaryMax: input.salaryMax ?? null,
        currency: input.currency ?? "USD",
        experience: input.experience ?? null,
        skills: input.skills ?? [],
        requirements: input.requirements ?? [],
        description: input.description ?? null,
        applicationUrl: input.applicationUrl,
        status: input.status ?? "ACTIVE",
        postedAt: input.postedAt ?? null,
      })
      .returning();

    return this.toEntity(created!);
  }

  async update(id: string, input: UpdateJobInput): Promise<Job> {
    const valuesToUpdate: Partial<typeof jobsTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.source !== undefined) valuesToUpdate.source = input.source;
    if (input.sourceJobId !== undefined) valuesToUpdate.sourceJobId = input.sourceJobId;
    if (input.jobSourceId !== undefined) valuesToUpdate.jobSourceId = input.jobSourceId;
    if (input.canonicalUrl !== undefined) valuesToUpdate.canonicalUrl = input.canonicalUrl;
    if (input.title !== undefined) valuesToUpdate.title = input.title;
    if (input.company !== undefined) valuesToUpdate.company = input.company;
    if (input.location !== undefined) valuesToUpdate.location = input.location;
    if (input.remoteType !== undefined) valuesToUpdate.remoteType = input.remoteType;
    if (input.allowedCountries !== undefined) valuesToUpdate.allowedCountries = input.allowedCountries;
    if (input.salary !== undefined) valuesToUpdate.salary = input.salary;
    if (input.salaryMin !== undefined) valuesToUpdate.salaryMin = input.salaryMin;
    if (input.salaryMax !== undefined) valuesToUpdate.salaryMax = input.salaryMax;
    if (input.currency !== undefined) valuesToUpdate.currency = input.currency;
    if (input.experience !== undefined) valuesToUpdate.experience = input.experience;
    if (input.skills !== undefined) valuesToUpdate.skills = input.skills;
    if (input.requirements !== undefined) valuesToUpdate.requirements = input.requirements;
    if (input.description !== undefined) valuesToUpdate.description = input.description;
    if (input.applicationUrl !== undefined) valuesToUpdate.applicationUrl = input.applicationUrl;
    if (input.status !== undefined) valuesToUpdate.status = input.status;
    if (input.postedAt !== undefined) valuesToUpdate.postedAt = input.postedAt;

    const [updated] = await this.db
      .update(jobsTable)
      .set(valuesToUpdate)
      .where(eq(jobsTable.id, id))
      .returning();

    if (!updated) {
      throw new JobNotFoundError(`Job with ID "${id}" not found.`);
    }

    return this.toEntity(updated);
  }

  async list(filter?: JobFilter): Promise<Job[]> {
    const conditions = [];

    if (filter?.source) {
      conditions.push(eq(jobsTable.source, filter.source));
    }
    if (filter?.jobSourceId) {
      conditions.push(eq(jobsTable.jobSourceId, filter.jobSourceId));
    }
    if (filter?.remoteType) {
      conditions.push(eq(jobsTable.remoteType, filter.remoteType));
    }
    if (filter?.status) {
      conditions.push(eq(jobsTable.status, filter.status));
    }
    if (filter?.company) {
      conditions.push(eq(jobsTable.company, filter.company));
    }

    let query = this.db
      .select()
      .from(jobsTable)
      .orderBy(desc(jobsTable.createdAt));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    if (filter?.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter?.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;
    return rows.map((r) => this.toEntity(r));
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(jobsTable)
      .where(eq(jobsTable.id, id))
      .returning({ id: jobsTable.id });

    return result.length > 0;
  }
}
