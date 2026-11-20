import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CLERK_AUTH_ACTIVE =
  process.env.AUTH_ENABLED?.trim().toLowerCase() === "true" &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) &&
  Boolean(process.env.CLERK_SECRET_KEY?.trim());

function passThrough(request: NextRequest) {
  void request;
  return NextResponse.next();
}

const middlewareHandler: (request: NextRequest) => ReturnType<typeof NextResponse.next> =
  CLERK_AUTH_ACTIVE
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./middleware.clerk").default
    : passThrough;

export default middlewareHandler;

export const config = {
  matcher: [
    // Dashboard + auth pages only — API session checks are in route handlers (J-4).
    "/((?!_next|api/|trpc/|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
