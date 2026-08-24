import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "iosbid_sid";

export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get(COOKIE)) {
    res.cookies.set(COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
