import { NextResponse } from "next/server";
import { brainProductionPolicy, getBrainStatus } from "@/lib/brain/service";

export async function GET() {
  try {
    const status = await getBrainStatus();
    return NextResponse.json({ ...status, productionPolicy: brainProductionPolicy });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Brain Studio status" },
      { status: 502 },
    );
  }
}
