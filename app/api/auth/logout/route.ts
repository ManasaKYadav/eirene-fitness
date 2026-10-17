import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // Overwrite the cookie with an empty value that expires immediately. The
  // options must match the ones used when signing in, or the browser keeps
  // the original cookie alongside this one.
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });

  return response;
}
