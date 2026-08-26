import { NextRequest, NextResponse } from "next/server";
import { createImprovement, listImprovements } from "@/lib/brain/service";

export async function GET() {
  return NextResponse.json({ items: listImprovements(), persistence: "ephemeral" });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const goal = typeof body.userGoal === "string" ? body.userGoal.trim() : "";
  if (!goal) return NextResponse.json({ error: "userGoal is required" }, { status: 400 });
  if (goal.length > 6000) return NextResponse.json({ error: "userGoal is too long" }, { status: 413 });
  return NextResponse.json({ item: createImprovement(goal), persistence: "ephemeral" }, { status: 201 });
}
