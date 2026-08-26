import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, isMutatingRequest, isSameOriginRequest } from "@/lib/request-security";

function unauthorized(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

function securityUnavailable(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "OS authentication is not configured" }, { status: 503 });
  }
  return NextResponse.redirect(new URL("/login?config=missing", request.url));
}

export async function proxy(request: NextRequest) {
  const auth = getAuthConfig();
  if (!auth.ready) return securityUnavailable(request);

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token, auth.secret))) return unauthorized(request);

  const protectedApi =
    request.nextUrl.pathname.startsWith("/api/hermes/") ||
    request.nextUrl.pathname.startsWith("/api/risk/") ||
    request.nextUrl.pathname.startsWith("/api/brain/");

  if (protectedApi && isMutatingRequest(request)) {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }

    const ip = getClientIp(request);
    const limit = checkRateLimit(`mutation:${ip}`, 30, 60_000);
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/hermes/:path*",
    "/api/risk/:path*",
    "/api/brain/:path*",
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
