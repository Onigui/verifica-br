import { NextResponse, type NextRequest } from "next/server";

/** Barreira rápida: sem cookie de sessão, nem chega ao painel. A validação real é feita no servidor (requireUser). */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("vbr_session")?.value) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
