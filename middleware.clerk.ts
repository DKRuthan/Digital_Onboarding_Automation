import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/** Public auth pages — never require sign-in (J-3). */
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

/** Dashboard pages protected when AUTH_ENABLED=true (J-3). API routes deferred to J-4. */
const isProtectedDashboardRoute = createRouteMatcher([
  "/",
  "/customers(.*)",
  "/email-library(.*)",
  "/sequences(.*)",
  "/automations(.*)",
  "/action-queue(.*)",
  "/send-logs(.*)",
  "/reports(.*)",
]);

/**
 * Clerk middleware — loaded only when AUTH_ENABLED=true and Clerk keys exist.
 * J-3: protect dashboard pages; J-4: API protection.
 */
export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return;
  }

  if (isProtectedDashboardRoute(req)) {
    await auth.protect();
  }
});
