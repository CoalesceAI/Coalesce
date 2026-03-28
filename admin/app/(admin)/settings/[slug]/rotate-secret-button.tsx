"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function RotateSecretButton({ slug }: { slug: string }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function rotate() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/admin/orgs/${slug}/signing-secret/rotate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        toast.error("Failed to rotate signing secret");
        return;
      }
      toast.success("Signing secret rotated. Existing signed URLs will be invalidated.");
      router.refresh();
    } catch (err) {
      toast.error(String(err));
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
        className="text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
      >
        Rotate Secret
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-400">This will invalidate all signed URLs.</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={rotate}
        disabled={loading}
        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
      >
        {loading ? "Rotating..." : "Confirm"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setConfirmed(false)}
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        Cancel
      </Button>
    </div>
  );
}
