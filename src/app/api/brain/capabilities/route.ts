import { NextResponse } from "next/server";
import { getCapabilityItems } from "@/lib/brain/service";

export async function GET() {
  try {
    return NextResponse.json(await getCapabilityItems());
  } catch (error) {
    return NextResponse.json(
      { items: [], state: "offline", message: error instanceof Error ? error.message : "Capability retrieval failed" },
      { status: 502 },
    );
  }
}
