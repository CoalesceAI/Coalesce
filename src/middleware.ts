// middleware.js
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/public(.*)",
  "/api/user/create-user(.*)",
  "/api/public(.*)",
  "/api/slack/events(.*)",
  "/api/events/ingest(.*)",
  "/accept-invitation(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  if (req.headers.get("x-internal-api-call") === "true") {
    return NextResponse.next();
  }

  if (!isPublicRoute(req)) {
    try {
      await auth.protect();
    } catch (e) {
      console.log(e);
      return NextResponse.redirect(
        new URL("/sign-in", process.env.NEXT_PUBLIC_APP_URL),
      );
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
