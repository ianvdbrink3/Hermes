import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch } from "@/lib/brain/hermes-client";
import { cleanSessionId, cleanTitle, parseControlEnvironment, researchOnly } from "@/lib/brain/control";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });
  if (!researchOnly(environment)) return NextResponse.json({ error: "Only his-research sessions can be forked" }, { status: 403 });

  const { id: rawId } = await context.params;
  const id = cleanSessionId(rawId);
  if (!id) return NextResponse.json({ error: "invalid session id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const title = cleanTitle(body.title);

  try {
    const response = await brainHermesFetch("research", `/api/sessions/${encodeURIComponent(id)}/fork`, {
      method: "POST",
      body: JSON.stringify(title ? { title } : {}),
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to fork Hermes session" }, { status: 502 });
  }
}