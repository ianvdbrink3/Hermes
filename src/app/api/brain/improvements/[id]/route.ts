import { NextResponse } from "next/server";
import { getImprovement } from "@/lib/brain/service";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const item = getImprovement(id);
  if (!item) return NextResponse.json({ error: "Improvement not found" }, { status: 404 });
  return NextResponse.json({ item, persistence: "ephemeral" });
}
