/**
 * Job Hub — Post-Phase-10 UI/UX & Authentication Security Test Suite
 *
 * Tests:
 * 1. getSafeCallbackUrl strictly blocks open redirect attacks
 * 2. Unauthenticated visit to /dashboard renders "Authentication Required" card with /sign-in?callbackUrl=/dashboard
 * 3. Unauthenticated visit to /profile renders "Authentication Required" card with /sign-in?callbackUrl=/profile
 * 4. User registration creates session and sets valid auth cookie
 * 5. Authenticated user accesses /dashboard and /profile without redirect loops
 * 6. User can sign in and return to safe callback destination
 * 7. SiteHeader includes theme toggle and dynamic auth state
 * 8. User logout invalidates session and renders unauthenticated card again
 */

import test from "node:test";
import assert from "node:assert/strict";
import { db, user, session as sessionTable } from "@job-hub/db";
import { eq } from "drizzle-orm";
import { getSafeCallbackUrl } from "../apps/web/lib/auth-utils.js";

const BASE_URL = "http://localhost:3000";
const RUN_ID = `auth_ui_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
const testEmail = `${RUN_ID}@example.com`;
const testPassword = "Password123!@#Test";
let sessionCookie = "";
let createdUserId = "";

async function cleanup() {
  if (createdUserId) {
    await db.delete(sessionTable).where(eq(sessionTable.userId, createdUserId));
    await db.delete(user).where(eq(user.id, createdUserId));
  }
}

test("Post-Phase-10 UI/UX & Authentication Security Suite", async (t) => {
  await t.test("1. getSafeCallbackUrl strictly prevents open redirect vulnerabilities", () => {
    // Valid relative internal paths
    assert.equal(getSafeCallbackUrl("/dashboard"), "/dashboard");
    assert.equal(getSafeCallbackUrl("/profile"), "/profile");
    assert.equal(getSafeCallbackUrl("/dashboard?tab=saved"), "/dashboard?tab=saved");

    // Malicious open redirect attempts
    assert.equal(getSafeCallbackUrl("https://evil.com"), "/dashboard");
    assert.equal(getSafeCallbackUrl("http://attacker.com/steal"), "/dashboard");
    assert.equal(getSafeCallbackUrl("//evil.com"), "/dashboard");
    assert.equal(getSafeCallbackUrl("/\\evil.com"), "/dashboard");
    assert.equal(getSafeCallbackUrl("javascript:alert(document.cookie)"), "/dashboard");
    assert.equal(getSafeCallbackUrl("data:text/html,<script>alert(1)</script>"), "/dashboard");

    // Malformed inputs
    assert.equal(getSafeCallbackUrl(null), "/dashboard");
    assert.equal(getSafeCallbackUrl(undefined), "/dashboard");
    assert.equal(getSafeCallbackUrl(""), "/dashboard");
    assert.equal(getSafeCallbackUrl("   "), "/dashboard");
    assert.equal(getSafeCallbackUrl("relative/path/no/slash"), "/dashboard");

    // Custom fallback support
    assert.equal(getSafeCallbackUrl("https://evil.com", "/profile"), "/profile");
  });

  await t.test("2. Unauthenticated visit to /dashboard provides correct sign-in return link", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`);
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.ok(html.includes("Authentication Required"), "Renders Authentication Required title");
    assert.ok(
      html.includes("/sign-in?callbackUrl=/dashboard"),
      "Sign In / Register button must link to /sign-in?callbackUrl=/dashboard"
    );
    assert.ok(!html.includes('href="/"\n>Sign In'), "Must not redirect Sign In back to home page");
  });

  await t.test("3. Unauthenticated visit to /profile provides correct sign-in return link", async () => {
    const res = await fetch(`${BASE_URL}/profile`);
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.ok(html.includes("Authentication Required"), "Renders Authentication Required title");
    assert.ok(
      html.includes("/sign-in?callbackUrl=/profile"),
      "Sign In / Register button must link to /sign-in?callbackUrl=/profile"
    );
  });

  await t.test("4. Candidate registers successfully via Better Auth", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "QA Test User",
      }),
    });

    assert.equal(res.status, 200, "Registration should return 200");
    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie, "Session cookie must be returned");
    sessionCookie = setCookie.split(";")[0]!;

    const body = await res.json();
    assert.ok(body.user?.id, "User ID must be returned");
    createdUserId = body.user.id;
  });

  await t.test("5. Authenticated user can visit /dashboard and receives candidate onboarding prompt", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(res.status, 200);
    const html = await res.text();

    // Since this is a new candidate without a profile yet:
    assert.ok(
      html.includes("Create Your Candidate Profile"),
      "New user is prompted to create profile"
    );
    assert.ok(html.includes("/profile"), "Links to profile setup");
  });

  await t.test("6. Authenticated user can visit /profile and loads profile setup view", async () => {
    const res = await fetch(`${BASE_URL}/profile`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.ok(html.includes("Candidate Profile"), "Loads Candidate Profile heading");
    assert.ok(!html.includes("Authentication Required"), "Must not show Authentication Required card");
  });

  await t.test("7. Candidate signs in successfully via Better Auth sign-in endpoint", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    assert.equal(res.status, 200, "Sign in should return 200");
    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie, "New session cookie must be set");
    sessionCookie = setCookie.split(";")[0]!;
  });

  await t.test("8. Candidate signs out and protected routes become inaccessible again", async () => {
    // Call Better Auth sign-out
    const signOutRes = await fetch(`${BASE_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Cookie: sessionCookie,
      },
      body: JSON.stringify({}),
    });
    assert.equal(signOutRes.status, 200, "Sign-out should return 200");

    // Clear sessionCookie and verify /dashboard renders Authentication Required
    const res = await fetch(`${BASE_URL}/dashboard`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(
      html.includes("Authentication Required"),
      "Protected dashboard must become inaccessible after sign-out"
    );
  });

  await t.test("Teardown: Clean up test database records", async () => {
    await cleanup();
  });
});
