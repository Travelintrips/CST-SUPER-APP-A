export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch?: string;
  isValid: boolean;
}

export function parseGitHubUrl(input: string): ParsedGitHubUrl {
  const result: ParsedGitHubUrl = {
    owner: "",
    repo: "",
    isValid: false,
  };

  if (!input || input.trim() === "") {
    return result;
  }

  const cleanInput = input.trim();

  // Try to match shorthand "owner/repo" or "owner/repo@branch"
  if (!cleanInput.includes("http") && !cleanInput.includes("github.com")) {
    const parts = cleanInput.split("/");
    if (parts.length === 2) {
      result.owner = parts[0];
      const repoAndBranch = parts[1].split("@");
      result.repo = repoAndBranch[0];
      if (repoAndBranch.length > 1) {
        result.branch = repoAndBranch[1];
      }
      result.isValid = true;
      return result;
    }
  }

  try {
    let urlString = cleanInput;
    if (!urlString.startsWith("http")) {
      urlString = `https://${urlString}`;
    }
    const url = new URL(urlString);
    
    if (url.hostname === "github.com" || url.hostname === "www.github.com") {
      const paths = url.pathname.split("/").filter(Boolean);
      
      if (paths.length >= 2) {
        result.owner = paths[0];
        result.repo = paths[1];
        result.isValid = true;
        
        if (paths.length >= 4 && paths[2] === "tree") {
          result.branch = paths.slice(3).join("/");
        }
      }
    }
  } catch (e) {
    // Invalid URL
  }

  return result;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string;
  updated_at: string;
  default_branch: string;
  license: {
    key: string;
    name: string;
    spdx_id: string;
    url: string;
  } | null;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

const GITHUB_API_BASE = "https://api.github.com";

export async function fetchRepoInfo(owner: string, repo: string): Promise<GitHubRepo> {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: {
      "Accept": "application/vnd.github.v3+json",
    }
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Repository not found");
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded");
    throw new Error(`Failed to fetch repository info: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchRepoBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches?per_page=100`, {
    headers: {
      "Accept": "application/vnd.github.v3+json",
    }
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Repository not found");
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded");
    throw new Error(`Failed to fetch branches: ${res.statusText}`);
  }

  return res.json();
}

export function getZipDownloadUrl(owner: string, repo: string, branch: string): string {
  return `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
}

export interface GitHubContentItem {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
  download_url: string | null;
  html_url: string;
}

export async function fetchRepoContents(
  owner: string,
  repo: string,
  branch: string,
  path: string = ""
): Promise<GitHubContentItem[]> {
  const encodedPath = path ? `/${encodeURIComponent(path).replace(/%2F/g, "/")}` : "";
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents${encodedPath}?ref=${encodeURIComponent(branch)}`,
    { headers: { Accept: "application/vnd.github.v3+json" } }
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error("Path not found");
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded");
    throw new Error(`Failed to fetch contents: ${res.statusText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Expected a directory");

  return (data as GitHubContentItem[]).sort((a, b) => {
    if (a.type === "dir" && b.type !== "dir") return -1;
    if (a.type !== "dir" && b.type === "dir") return 1;
    return a.name.localeCompare(b.name);
  });
}

export function getFolderDownloadUrl(owner: string, repo: string, branch: string, path: string): string {
  const githubUrl = `https://github.com/${owner}/${repo}/tree/${branch}/${path}`;
  return `https://download-directory.github.io/?url=${encodeURIComponent(githubUrl)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
