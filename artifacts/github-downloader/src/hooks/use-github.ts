import { useQuery } from "@tanstack/react-query";
import { fetchRepoInfo, fetchRepoBranches, fetchRepoContents } from "@/lib/github";

export function useGitHubRepo(owner: string, repo: string, enabled: boolean) {
  return useQuery({
    queryKey: ["github", "repo", owner, repo],
    queryFn: () => fetchRepoInfo(owner, repo),
    enabled: enabled && !!owner && !!repo,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

export function useGitHubBranches(owner: string, repo: string, enabled: boolean) {
  return useQuery({
    queryKey: ["github", "branches", owner, repo],
    queryFn: () => fetchRepoBranches(owner, repo),
    enabled: enabled && !!owner && !!repo,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

export function useGitHubContents(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["github", "contents", owner, repo, branch, path],
    queryFn: () => fetchRepoContents(owner, repo, branch, path),
    enabled: enabled && !!owner && !!repo && !!branch,
    retry: false,
    staleTime: 1000 * 60 * 2,
  });
}
