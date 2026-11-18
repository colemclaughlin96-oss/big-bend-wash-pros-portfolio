import { trpc } from "@/lib/trpc";

/**
 * Team-auth state for the admin dashboard (email + password sessions).
 * Independent of the Manus OAuth `useAuth` hook.
 */
export function useTeamAuth() {
  const { data, isLoading, refetch } = trpc.team.me.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });

  return {
    user: data ?? null,
    loading: isLoading,
    isAuthenticated: !!data,
    isAdmin: data?.role === "admin",
    refetch,
  };
}

export type TeamAuthUser = NonNullable<ReturnType<typeof useTeamAuth>["user"]>;
