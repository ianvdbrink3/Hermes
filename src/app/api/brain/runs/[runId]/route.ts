import { NextRequest, NextResponse } from "next/server";
import { getBrainRun } from "@/lib/brain/service";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const environment = request.nextUrl.searchParams.get("environment");
  if (environment !== "research") {
    return NextResponse.json({ error: "Research environment required" }, { status: 403 });
  }

  try {
    return NextResponse.json(await getBrainRun("research", runId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read Brain Studio run" },
      { status: 502 },
    );
  }
}
