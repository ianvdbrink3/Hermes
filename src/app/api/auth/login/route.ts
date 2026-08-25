import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, getAuthConfig, secureStringEqual, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, isSameOriginRequest } from "@/lib/request-security";

export async function POST(request: NextRequest) {
  const auth = getAuthConfig();
  if (!auth.ready) {
    return NextResponse.json({ error: "OS authentication is not configured" }, { status: 503 });
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(`login:${ip}`, 5, 60_000);
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
    return NextResponse.json({ error: "Too many login attempts" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await secureStringEqual(password, auth.password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken(auth.secret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
