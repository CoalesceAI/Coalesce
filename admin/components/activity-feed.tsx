"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { getCoalesceApiBase } from "@/lib/api-base";

const ACTION_LABELS: Record<string, string> = {
  "session.created": "New support session",
  "session.resolved": "Session resolved",
  "org.created": "Organization created",
  "org.updated": "Organization updated",
  "key.generated": "API key generated",
  "key.revoked": "API key revoked",
  "doc.added": "Document added",
  "doc.deleted": "Document deleted",
  "integration.connected": "Integration connected",
  "integration.disconnected": "Integration disconnected",
};

interface ActivityEvent {
  id: string;
  actor: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function ActivityFeed() {
  const { getToken } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${getCoalesceApiBase()}/admin/activity?limit=20`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setEvents(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-zinc-500 text-sm text-center py-4">
        No activity yet. Events will appear here as they occur.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-auto">
      {events.map((event) => (
        <div key={event.id} className="flex items-start gap-3 py-2 border-b border-zinc-800/50 last:border-0">
          <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-zinc-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-300">
              {ACTION_LABELS[event.action] ?? event.action}
            </p>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              {event.actor} &middot; {new Date(event.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
