import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`. Same
// behaviour, same matcher config — only the file and export names changed.
//
// This runs before every matched request and does the coarse check: are you
// signed in, and are you allowed in /admin. Each route still enforces
// ownership itself, since a token says who you are but not which rows are
// yours.

const PUBLIC_PATHS = ["/", "/login", "/register"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.includes(pathname);

  // Signed in already: no reason to see the login or register form again.
  if (session && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isPublic) {
    return NextResponse.next();
  }

  if (!session) {
    // Remember where they were headed so login can send them back.
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/dashboard") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard?denied=admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets, the API routes (which check the
  // session themselves and must return JSON rather than a redirect), and
  // static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
