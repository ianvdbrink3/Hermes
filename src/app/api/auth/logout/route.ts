import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-security";

export async function POST(request: NextRequest) {
  const auth = getAuthConfig();
  if (!auth.ready) return NextResponse.json({ error: "OS authentication is not configured" }, { status: 503 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token, auth.secret))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
