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
  private: boolean;
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

export interface RateLimit {
  limit: number;
  used: number;
  remaining: number;
  reset: number;
}

export interface RateLimitResponse {
  resources: {
    core: RateLimit;
    search: RateLimit;
    graphql: RateLimit;
  };
  rate: RateLimit;
}

const GITHUB_API_BASE = "https://api.github.com";

function buildHeaders(token?: string, extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    ...extra,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchRepoInfo(owner: string, repo: string, token?: string): Promise<GitHubRepo> {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Repository not found");
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded");
    if (res.status === 401) throw new Error("Invalid GitHub token");
    throw new Error(`Failed to fetch repository info: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchRepoBranches(owner: string, repo: string, token?: string): Promise<GitHubBranch[]> {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches?per_page=100`, {
    headers: buildHeaders(token),
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Repository not found");
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded");
    if (res.status === 401) throw new Error("Invalid GitHub token");
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
  path: string = "",
  token?: string
): Promise<GitHubContentItem[]> {
  const encodedPath = path ? `/${encodeURIComponent(path).replace(/%2F/g, "/")}` : "";
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents${encodedPath}?ref=${encodeURIComponent(branch)}`,
    { headers: buildHeaders(token) }
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error("Path not found");
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded");
    if (res.status === 401) throw new Error("Invalid GitHub token");
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

export async function fetchFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token?: string
): Promise<string> {
  if (token) {
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      { headers: buildHeaders(token, { Accept: "application/vnd.github.v3.raw" }) }
    );
    if (!res.ok) {
      if (res.status === 404) throw new Error("File not found");
      if (res.status === 401) throw new Error("Invalid GitHub token");
      throw new Error(`Failed to fetch file: ${res.statusText}`);
    }
    return res.text();
  }

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(rawUrl);
  if (!res.ok) {
    if (res.status === 404) throw new Error("File not found");
    throw new Error(`Failed to fetch file: ${res.statusText}`);
  }
  return res.text();
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    c: "c", cpp: "cpp", cs: "csharp", php: "php", swift: "swift",
    kt: "kotlin", sh: "bash", bash: "bash", zsh: "bash",
    yaml: "yaml", yml: "yaml", json: "json", toml: "toml",
    html: "html", css: "css", scss: "scss", sass: "sass", less: "less",
    md: "markdown", mdx: "markdown", sql: "sql", graphql: "graphql",
    tf: "hcl", dockerfile: "dockerfile", makefile: "makefile",
    xml: "xml", svg: "xml", env: "bash", ini: "ini", conf: "bash",
    r: "r", lua: "lua", perl: "perl", scala: "scala", dart: "dart",
    ex: "elixir", exs: "elixir", clj: "clojure", hs: "haskell",
    vue: "html", astro: "html", prisma: "sql",
  };
  return map[ext] ?? "text";
}

export interface CodeSearchItem {
  name: string;
  path: string;
  sha: string;
  html_url: string;
  repository: { full_name: string };
  text_matches?: Array<{
    fragment: string;
    matches: Array<{ text: string; indices: [number, number] }>;
  }>;
}

export interface CodeSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: CodeSearchItem[];
}

export async function fetchCodeSearch(
  owner: string,
  repo: string,
  query: string,
  token?: string
): Promise<CodeSearchResult> {
  const q = encodeURIComponent(`${query} repo:${owner}/${repo}`);
  const res = await fetch(
    `https://api.github.com/search/code?q=${q}&per_page=30`,
    {
      headers: buildHeaders(token, {
        Accept: "application/vnd.github.v3.text-match+json",
      }),
    }
  );

  if (!res.ok) {
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded. Please wait a moment and try again.");
    if (res.status === 422) throw new Error("Invalid search query. Try a different term.");
    if (res.status === 401) throw new Error("Invalid GitHub token.");
    throw new Error(`Search failed: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchRateLimit(token?: string): Promise<RateLimitResponse> {
  const res = await fetch(`${GITHUB_API_BASE}/rate_limit`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch rate limit");
  return res.json();
}

export function isBinaryPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const binaryExts = new Set([
    "png","jpg","jpeg","gif","webp","ico","bmp","tiff","svg",
    "zip","tar","gz","rar","7z","bz2","xz",
    "pdf","doc","docx","xls","xlsx","ppt","pptx",
    "mp3","mp4","wav","ogg","avi","mov","mkv","webm",
    "ttf","otf","woff","woff2","eot",
    "exe","dll","so","dylib","bin","o","a",
    "pyc","class","jar","war","ear",
  ]);
  return binaryExts.has(ext);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
