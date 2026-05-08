import { useQuery } from "@tanstack/react-query";
import { fetchRepoInfo, fetchRepoBranches } from "@/lib/github";

export function useGitHubRepo(owner: string, repo: string, enabled: boolean) {
  return useQuery({
    queryKey: ["github", "repo", owner, repo],
    queryFn: () => fetchRepoInfo(owner, repo),
    enabled: enabled && !!owner && !!repo,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 mins
  });
}

export function useGitHubBranches(owner: string, repo: string, enabled: boolean) {
  return useQuery({
    queryKey: ["github", "branches", owner, repo],
    queryFn: () => fetchRepoBranches(owner, repo),
    enabled: enabled && !!owner && !!repo,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 mins
  });
}
