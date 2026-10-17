import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { queryOne } from "@/lib/db";
import { signSession, SESSION_COOKIE, sessionCookieOptions, type Role } from "@/lib/auth";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

type UserRow = {
  user_id: number;
  email: string;
  full_name: string;
  role: Role;
  password_hash: string;
};

// A real bcrypt hash of a value nobody can log in with. Comparing against this
// when the email is unknown keeps the response time similar to a wrong
// password, so the endpoint does not reveal which emails are registered.
const DUMMY_HASH = "$2b$10$ycZiz/VRA9rSYgJmpUn.3OyXwJbj6whbyT2QR45Q2T87XYfdple26";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your email and password" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  try {
    const user = await queryOne<UserRow>(
      `SELECT user_id, email, full_name, role, password_hash
         FROM users
        WHERE email = $1`,
      [email.toLowerCase()]
    );

    const matches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

    // One message for both "no such email" and "wrong password", so the form
    // cannot be used to discover which accounts exist.
    if (!user || !matches) {
      return NextResponse.json({ error: "Email or password is incorrect" }, { status: 401 });
    }

    const token = await signSession({
      userId: user.user_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    });

    const response = NextResponse.json({
      user: { id: user.user_id, email: user.email, fullName: user.full_name, role: user.role },
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (err) {
    console.error("login failed", err);
    return NextResponse.json({ error: "Could not sign you in" }, { status: 500 });
  }
}
