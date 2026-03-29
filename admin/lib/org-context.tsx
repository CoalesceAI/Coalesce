"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { getApoyoApiBase } from "./api-base";

export interface OrgWithRole {
  id: string;
  slug: string;
  name: string;
  settings: Record<string, unknown>;
  signing_secret: string;
  created_at: string;
  updated_at: string;
  role: "admin" | "member";
}

interface OrgContextValue {
  currentOrg: OrgWithRole | null;
  userOrgs: OrgWithRole[];
  /** True until Clerk has loaded and we have finished the initial /admin/me/orgs fetch (if signed in). */
  loading: boolean;
  /** Set when the org list API fails or the session token is unavailable. */
  error: string | null;
  switchOrg: (slug: string) => void;
  refreshOrgs: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue>({
  currentOrg: null,
  userOrgs: [],
  loading: true,
  error: null,
  switchOrg: () => {},
  refreshOrgs: async () => {},
});

const STORAGE_KEY = "apoyo_current_org";

export function OrgProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [userOrgs, setUserOrgs] = useState<OrgWithRole[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrgs = useCallback(async () => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setUserOrgs([]);
      setCurrentSlug(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError("Could not get a session token. Try refreshing the page.");
        setUserOrgs([]);
        setCurrentSlug(null);
        return;
      }

      const base = getApoyoApiBase();
      const res = await fetch(`${base}/admin/me/orgs`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        let detail = `Could not load organizations (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          /* ignore */
        }
        if (res.status === 401) {
          detail =
            "API returned 401 — check that the API server uses the same CLERK_SECRET_KEY as this app and NEXT_PUBLIC_API_URL points to it.";
        }
        setError(detail);
        setUserOrgs([]);
        setCurrentSlug(null);
        return;
      }

      let orgs: OrgWithRole[] = await res.json();

      if (orgs.length === 0) {
        const firstName = user?.firstName ?? user?.username ?? null;
        const orgName = firstName ? `${firstName}'s Organization` : "My Organization";
        const bootRes = await fetch(`${base}/admin/me/bootstrap`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: orgName }),
        });
        if (bootRes.ok) {
          const data = (await bootRes.json()) as { orgs: OrgWithRole[] };
          orgs = data.orgs ?? [];
        } else {
          let detail = `Could not set up your workspace (${bootRes.status})`;
          try {
            const body = (await bootRes.json()) as { error?: string };
            if (body.error) detail = body.error;
          } catch {
            /* ignore */
          }
          setError(detail);
          setUserOrgs([]);
          setCurrentSlug(null);
          return;
        }
      }

      setUserOrgs(orgs);

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && orgs.some((o) => o.slug === saved)) {
        setCurrentSlug(saved);
      } else if (orgs.length > 0) {
        const first = orgs[0];
        setCurrentSlug(first.slug);
        localStorage.setItem(STORAGE_KEY, first.slug);
      } else {
        setCurrentSlug(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error loading organizations");
      setUserOrgs([]);
      setCurrentSlug(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, isLoaded, isSignedIn, user]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const switchOrg = useCallback(
    (slug: string) => {
      const org = userOrgs.find((o) => o.slug === slug);
      if (org) {
        setCurrentSlug(slug);
        localStorage.setItem(STORAGE_KEY, slug);
      }
    },
    [userOrgs],
  );

  const currentOrg = userOrgs.find((o) => o.slug === currentSlug) ?? null;

  return (
    <OrgContext.Provider
      value={{
        currentOrg,
        userOrgs,
        loading,
        error,
        switchOrg,
        refreshOrgs: fetchOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
