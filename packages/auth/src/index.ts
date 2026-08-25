import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { toNextJsHandler } from "better-auth/next-js";
import { db } from "@job-hub/db";
import * as schema from "@job-hub/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3099",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3099",
  ],
  secret:
    process.env.BETTER_AUTH_SECRET ||
    "development_insecure_better_auth_secret_minimum_32_characters",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
});

export const { GET: authGetHandler, POST: authPostHandler } = toNextJsHandler(auth.handler);
export { toNextJsHandler };

export type Auth = typeof auth;
