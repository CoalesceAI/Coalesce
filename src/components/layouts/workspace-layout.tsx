"use client";
import { usePathname } from "next/navigation";
import { ClerkProvider } from "@clerk/nextjs";
import { TeamProvider } from "@/app/providers/team-provider";
import { UserProvider } from "@/app/providers/user-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { Suspense } from "react";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage =
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/accept-invitation");
  const isCreatePage = pathname.startsWith("/create-team");
  const isPublicPage = pathname.startsWith("/public");

  return (
    <ClerkProvider>
      <TooltipProvider>
        <div className="min-h-screen bg-background font-sans antialiased">
          {isPublicPage ? (
            <div className="min-h-screen bg-background antialiased">
              {children}
            </div>
          ) : (
            <>
              {isAuthPage ? (
                <div className="h-screen w-full flex items-center justify-center">
                  <Suspense fallback={<div>Loading...</div>}>
                    {children}
                  </Suspense>
                </div>
              ) : (
                <UserProvider>
                  {isCreatePage ? (
                    <div className="h-screen w-full flex items-center justify-center">
                      {children}
                    </div>
                  ) : (
                    <TeamProvider>{children}</TeamProvider>
                  )}
                </UserProvider>
              )}
              <Toaster />
            </>
          )}
        </div>
      </TooltipProvider>
    </ClerkProvider>
  );
}
