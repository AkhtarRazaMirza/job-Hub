import { NextResponse } from "next/server";
import { db, healthCheck } from "@job-hub/db";

export async function GET() {
  try {
    const checks = await db.select().from(healthCheck).limit(5);
    return NextResponse.json({ ok: true, status: "healthy", database: "connected", checks });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        database: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
