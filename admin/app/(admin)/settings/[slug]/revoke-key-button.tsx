"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getCoalesceApiBase } from "@/lib/api-base";
import { Button } from "@/components/ui/button";

export function RevokeKeyButton({
  slug,
  keyId,
}: {
  slug: string;
  keyId: string;
}) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function revoke() {
    setLoading(true);
    try {
      const token = await getToken();
      await fetch(
        `${getCoalesceApiBase()}/admin/orgs/${slug}/keys/${keyId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      router.refresh();
    } finally {
      setLoading(false);
      setConfirmed(false);
    }
  }

  if (!confirmed) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setConfirmed(true)}
        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
      >
        Revoke
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-zinc-400">Confirm?</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={revoke}
        disabled={loading}
        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
      >
        {loading ? "…" : "Yes"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setConfirmed(false)}
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        No
      </Button>
    </div>
  );
}
