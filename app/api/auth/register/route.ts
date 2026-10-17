import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";
import { signSession, SESSION_COOKIE, sessionCookieOptions, type Role } from "@/lib/auth";

const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  email: z.email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

type NewUser = { user_id: number; email: string; full_name: string; role: Role };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    // Field-keyed messages so the form can show each error next to its input.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      fieldErrors[field] ??= issue.message;
    }
    return NextResponse.json({ error: "Please check the form", fieldErrors }, { status: 400 });
  }

  const { fullName, email, password } = parsed.data;
  const normalisedEmail = email.toLowerCase();

  // Cost 10 is the usual bcrypt default: slow enough to make guessing
  // expensive, fast enough that a login does not feel sluggish.
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await query<NewUser>(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING user_id, email, full_name, role`,
      [fullName, normalisedEmail, passwordHash]
    );

    const user = result.rows[0];
    const token = await signSession({
      userId: user.user_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    });

    // New accounts are always role 'user'. Admins are promoted in the
    // database, never by anything a visitor can send.
    const response = NextResponse.json(
      { user: { id: user.user_id, email: user.email, fullName: user.full_name, role: user.role } },
      { status: 201 }
    );
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (err) {
    // 23505 = unique_violation, from the UNIQUE constraint on users.email.
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return NextResponse.json(
        { error: "That email is already registered", fieldErrors: { email: "Already registered" } },
        { status: 409 }
      );
    }

    console.error("register failed", err);
    return NextResponse.json({ error: "Could not create the account" }, { status: 500 });
  }
}
