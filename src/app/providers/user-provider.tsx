// app/context/UserContext.tsx
"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { User, TeamUser } from "@/generated";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { fetcher } from "@/lib/utils";

type UserWithRole = User & {
  teamUser?: TeamUser[];
};

interface UserContextType {
  currentUser: UserWithRole | null;
  loading: boolean;
  setUserData: (user: UserWithRole) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [userData, setUserData] = useState<UserWithRole | null>(null);
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  // Only fetch user data if the user is signed in and the client-side hooks have loaded the user state
  const fetchUrl = isSignedIn && isLoaded ? `/api/user/get-user` : null;
  const { data: dbUser, isLoading: userLoading } = useSWR<
    UserWithRole | { error: string }
  >(fetchUrl, fetcher);

  useEffect(() => {
    if (!userLoading && isLoaded) {
      const timeoutId = setTimeout(() => {
        if (dbUser && !("error" in dbUser)) {
          setUserData(dbUser);
        } else if (!isSignedIn) {
          router.push("/404");
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [dbUser, userLoading, isSignedIn, isLoaded, router]);

  // Memoizing the context value to prevent unnecessary re-renders of consumers
  const providerValue = useMemo(
    () => ({
      currentUser: userData,
      loading: userLoading,
      setUserData,
    }),
    [userData, userLoading],
  );

  return (
    <UserContext.Provider value={providerValue}>
      {children}
    </UserContext.Provider>
  );
};

export const useCurrentUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useCurrentUser must be used within a UserProvider");
  }
  return context;
};
