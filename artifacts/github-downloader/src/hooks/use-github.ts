import { useQuery } from "@tanstack/react-query";
import { fetchRepoInfo, fetchRepoBranches, fetchRepoContents, fetchFileContent, fetchCodeSearch } from "@/lib/github";

export function useGitHubRepo(owner: string, repo: string, enabled: boolean, token?: string) {
  return useQuery({
    queryKey: ["github", "repo", owner, repo, token ?? ""],
    queryFn: () => fetchRepoInfo(owner, repo, token),
    enabled: enabled && !!owner && !!repo,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

export function useGitHubBranches(owner: string, repo: string, enabled: boolean, token?: string) {
  return useQuery({
    queryKey: ["github", "branches", owner, repo, token ?? ""],
    queryFn: () => fetchRepoBranches(owner, repo, token),
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
  enabled: boolean,
  token?: string
) {
  return useQuery({
    queryKey: ["github", "contents", owner, repo, branch, path, token ?? ""],
    queryFn: () => fetchRepoContents(owner, repo, branch, path, token),
    enabled: enabled && !!owner && !!repo && !!branch,
    retry: false,
    staleTime: 1000 * 60 * 2,
  });
}
