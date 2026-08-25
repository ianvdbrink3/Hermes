import { NextRequest, NextResponse } from "next/server";
import { hermesFetch, hermesMode, mockRun } from "@/lib/hermes";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "input is required" }, { status: 400 });
  if (input.length > 12000) return NextResponse.json({ error: "input is too long" }, { status: 413 });
  if (hermesMode() === "mock") return NextResponse.json(mockRun(input));
  try {
    const response = await hermesFetch("/v1/runs", {
      method: "POST",
      body: JSON.stringify({ input, instructions: "You are Hermes CIO inside Hermes Investment OS. Be evidence-first, never fabricate prices, and never bypass risk controls.", session_id: body.session_id || "investment-os-primary" }),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hermes request failed" }, { status: 502 });
  }
}
