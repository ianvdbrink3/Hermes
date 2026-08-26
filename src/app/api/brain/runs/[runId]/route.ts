import { NextRequest, NextResponse } from "next/server";
import { getBrainRun } from "@/lib/brain/service";
import type { BrainEnvironment } from "@/lib/brain/types";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const environment = request.nextUrl.searchParams.get("environment") as BrainEnvironment | null;
  if (environment !== "research" && environment !== "production") {
    return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getBrainRun(environment, runId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read Brain Studio run" },
      { status: 502 },
    );
  }
}
