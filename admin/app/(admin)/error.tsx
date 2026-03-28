"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AdminApiError } from "@/lib/api";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isApi = error instanceof AdminApiError;

  return (
    <div className="max-w-lg mx-auto mt-16 space-y-4 text-center">
      <h1 className="text-lg font-semibold text-zinc-100">Something went wrong</h1>
      <p className="text-sm text-zinc-400 whitespace-pre-wrap">{error.message}</p>
      {isApi && error.status === 401 && (
        <p className="text-xs text-zinc-500">
          Ensure the API is running and <code className="text-zinc-400">CLERK_SECRET_KEY</code> in
          the API matches your Clerk dashboard.
        </p>
      )}
      {isApi && error.message.includes("wrong host") && (
        <p className="text-xs text-zinc-500">
          Start the API: <code className="text-zinc-400">npm run dev</code> in the repo root (port 3000),
          or set <code className="text-zinc-400">NEXT_PUBLIC_API_URL</code> to your deployed API.
        </p>
      )}
      <Button
        type="button"
        onClick={reset}
        className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
      >
        Try again
      </Button>
    </div>
  );
}
