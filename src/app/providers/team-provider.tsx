// app/context/WorkspaceContext.tsx
"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { useMemo } from "react";
import { fetcher } from "@/lib/utils";
import { User, Team } from "@/generated";

interface TeamContextType {
  teamData: Team | null;
  userData: User | null;
  loading: boolean;
  setTeamData: (team: Team) => void;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export const TeamProvider = ({ children }: { children: ReactNode }) => {
  const [teamData, setTeamData] = useState<Team | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const { user, isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  const { data: team, isLoading: teamsLoading } = useSWR<
    Team | { error: string }
  >(isSignedIn ? `/api/team/get-team` : null, fetcher);

  // Handling redirections
  useEffect(() => {
    if (!isLoaded || !isSignedIn || teamsLoading) return;

    if (!team || "error" in team) {
      if (pathname !== "/create-team") {
        router.push("/create-team");
      }
    } else {
      if (pathname === "/") {
        router.push(`/${team.slug}/dashboard`);
      }
    }
  }, [isLoaded, isSignedIn, teamsLoading, team, pathname, router]);

  // Setting team and user data (deferred to avoid synchronous setState in effect)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (team && !("error" in team)) setTeamData(team);
      if (user) {
        setUserData({
          id: user.id,
          authId: user.id,
          name: user.fullName,
          email: user.primaryEmailAddress?.emailAddress || "",
          createdAt: new Date(user.createdAt || new Date()),
          updatedAt: new Date(user.updatedAt || new Date()),
        });
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [team, user]);

  const providerValue = useMemo(
    () => ({
      teamData,
      userData,
      loading: teamsLoading || !isLoaded,
      setTeamData,
    }),
    [teamData, userData, teamsLoading, isLoaded],
  );

  return (
    <TeamContext.Provider value={providerValue}>
      {children}
    </TeamContext.Provider>
  );
};

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error("useTeam must be used within a TeamProvider");
  }
  return context;
};
