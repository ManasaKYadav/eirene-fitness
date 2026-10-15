import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "eirene_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // one week, in seconds

export type Role = "admin" | "user";

export type Session = {
  userId: number;
  email: string;
  fullName: string;
  role: Role;
};

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Copy .env.example to .env.local and fill it in.");
  }
  return new TextEncoder().encode(secret);
}

/** Sign a session as a JWT. The role travels in the token so route protection
 *  can check it without a database round trip on every request. */
export async function signSession(session: Session): Promise<string> {
  return new SignJWT({
    email: session.email,
    fullName: session.fullName,
    role: session.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(session.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

/** Verify a token and return the session, or null if it is missing, tampered
 *  with, expired, or does not carry the fields we expect. */
export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const userId = Number(payload.sub);
    const role = payload.role;

    if (!Number.isInteger(userId) || (role !== "admin" && role !== "user")) {
      return null;
    }

    return {
      userId,
      email: String(payload.email ?? ""),
      fullName: String(payload.fullName ?? ""),
      role,
    };
  } catch {
    // Any verification failure is just "not signed in".
    return null;
  }
}

/** The signed-in user, read from the cookie. Null when signed out. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true, // not readable from JavaScript, so XSS cannot steal it
  sameSite: "lax" as const, // not sent on cross-site POSTs, which blocks basic CSRF
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
