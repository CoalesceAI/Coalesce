"use client";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { CreateTeamForm } from "./components/create-team-form";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/utils";

const CreateTeamPage = () => {
  const router = useRouter();
  const { user } = useUser();

  // get the user using swr
  const { data } = useSWR<{ slug?: string }>(
    user ? `/api/team/get-team` : null,
    fetcher,
  );
  const slug = data?.slug;

  useEffect(() => {
    if (slug) {
      router.push(`/${slug}/dashboard`);
    }
  }, [slug, router]);

  return (
    <div className={cn("pt-4")}>
      <div className="mx-auto px-4 text-center">
        <h1 className="mb-2 text-xl font-semibold">Create a team</h1>
        <p className="mb-2 leading-normal text-muted-foreground max-w-lg">
          Teams are shared environments for your team members to collaborate on
          their data. It fits right within your workflows.
        </p>
        <div className="pt-4">
          <CreateTeamForm />
        </div>
      </div>
    </div>
  );
};

export default CreateTeamPage;
