import { useState } from "react";
import {
  Folder, FileText, FileCode, FileImage, FileArchive,
  Download, ChevronRight, Home, AlertCircle, ExternalLink,
  FolderDown, Search, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useGitHubContents } from "@/hooks/use-github";
import { GitHubContentItem, getFolderDownloadUrl, formatFileSize, isBinaryPath } from "@/lib/github";
import { cn } from "@/lib/utils";

const CODE_EXTS = new Set([
  "ts","tsx","js","jsx","py","rb","go","rs","java","c","cpp",
  "cs","php","swift","kt","sh","bash","yaml","yml","json","toml",
  "html","css","scss","sass","less","md","mdx","sql","graphql",
  "tf","dockerfile","makefile","env","ini","conf","r","lua","perl",
  "scala","dart","ex","exs","clj","hs","vue","astro","prisma",
]);
const IMAGE_EXTS = new Set(["png","jpg","jpeg","gif","svg","webp","ico","bmp","tiff"]);
const ARCHIVE_EXTS = new Set(["zip","tar","gz","rar","7z","bz2","xz"]);

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) return <FileImage className="w-4 h-4 text-emerald-400 shrink-0" />;
  if (ARCHIVE_EXTS.has(ext)) return <FileArchive className="w-4 h-4 text-amber-400 shrink-0" />;
  if (CODE_EXTS.has(ext)) return <FileCode className="w-4 h-4 text-sky-400 shrink-0" />;
  return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
}

interface FileBrowserProps {
  owner: string;
  repo: string;
  branch: string;
  onFileClick: (item: GitHubContentItem) => void;
  selectedPath?: string;
  token?: string;
}

interface DirectoryViewProps {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  filter: string;
  onNavigate: (path: string) => void;
  onFileClick: (item: GitHubContentItem) => void;
  selectedPath?: string;
  token?: string;
}

function DirectoryView({ owner, repo, branch, path, filter, onNavigate, onFileClick, selectedPath, token }: DirectoryViewProps) {
  const { data, isLoading, error, isError } = useGitHubContents(owner, repo, branch, path, true, token);

  if (isLoading) {
    return (
      <div className="space-y-1 p-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="h-4" style={{ width: `${40 + (i * 13) % 45}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-4">
        <AlertCircle className="w-8 h-8 text-destructive/60" />
        <p className="text-sm text-muted-foreground">
          {(error as Error)?.message || "Failed to load directory"}
        </p>
      </div>
    );
  }

  const items = data ?? [];
  const filtered = filter.trim()
    ? items.filter((item) => item.name.toLowerCase().includes(filter.toLowerCase()))
    : items;

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <p className="text-sm text-muted-foreground">
          {filter ? "No files matching your search" : "This directory is empty"}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/20">
      {filtered.map((item) => (
        <FileRow
          key={item.sha}
          item={item}
          owner={owner}
          repo={repo}
          branch={branch}
          onNavigate={onNavigate}
          onFileClick={onFileClick}
          isSelected={selectedPath === item.path}
        />
      ))}
    </div>
  );
}

interface FileRowProps {
  item: GitHubContentItem;
  owner: string;
  repo: string;
  branch: string;
  onNavigate: (path: string) => void;
  onFileClick: (item: GitHubContentItem) => void;
  isSelected: boolean;
}

function FileRow({ item, owner, repo, branch, onNavigate, onFileClick, isSelected }: FileRowProps) {
  const isDir = item.type === "dir";
  const isPreviewable = !isDir;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDir) {
      window.open(getFolderDownloadUrl(owner, repo, branch, item.path), "_blank", "noopener,noreferrer");
    } else if (item.download_url) {
      const a = document.createElement("a");
      a.href = item.download_url;
      a.download = item.name;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleClick = () => {
    if (isDir) onNavigate(item.path);
    else onFileClick(item);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-2 transition-colors cursor-pointer",
        isSelected
          ? "bg-primary/10 border-l-2 border-primary"
          : isDir
            ? "hover:bg-primary/5"
            : "hover:bg-muted/30"
      )}
      onClick={handleClick}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isDir ? (
          <Folder className="w-4 h-4 text-yellow-400 shrink-0" />
        ) : (
          getFileIcon(item.name)
        )}
        <span className={cn(
          "text-sm truncate font-mono",
          isSelected ? "text-primary font-medium" : isDir ? "text-foreground font-medium" : "text-foreground/80"
        )}>
          {item.name}
        </span>
        {isDir && (
          <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {!isDir && item.size > 0 && (
          <span className="text-xs text-muted-foreground/50 hidden sm:block tabular-nums">
            {formatFileSize(item.size)}
          </span>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleDownload}
            title={isDir ? "Download folder as ZIP" : "Download file"}
          >
            {isDir ? <FolderDown className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); window.open(item.html_url, "_blank", "noopener,noreferrer"); }}
            title="View on GitHub"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FileBrowser({ owner, repo, branch, onFileClick, selectedPath, token }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [filter, setFilter] = useState("");

  const pathSegments = currentPath ? currentPath.split("/") : [];

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setFilter("");
  };

  const navigateToBreadcrumb = (index: number) => {
    navigateTo(index < 0 ? "" : pathSegments.slice(0, index + 1).join("/"));
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
      {/* Header / breadcrumb */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/10">
        <div className="flex items-center gap-1 flex-1 min-w-0 text-sm font-mono overflow-x-auto">
          <button
            onClick={() => navigateTo("")}
            className={cn(
              "flex items-center gap-1 hover:text-primary transition-colors shrink-0",
              currentPath === "" ? "text-foreground font-medium" : "text-muted-foreground"
            )}
          >
            <Home className="w-3.5 h-3.5" />
            <span className="text-xs">{repo}</span>
          </button>
          {pathSegments.map((segment, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={cn(
                  "hover:text-primary transition-colors text-xs",
                  i === pathSegments.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {segment}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="font-mono text-xs px-2 py-0.5 hidden sm:flex">
            {branch}
          </Badge>
          {currentPath && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => window.open(getFolderDownloadUrl(owner, repo, branch, currentPath), "_blank", "noopener,noreferrer")}
              title="Download this folder as ZIP"
            >
              <FolderDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download folder</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-3 py-2 border-b border-border/20 bg-muted/5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files..."
            className="pl-8 h-8 text-sm bg-background/30 border-border/30 font-mono placeholder:text-muted-foreground/40"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Directory listing */}
      <ScrollArea className="h-72">
        <DirectoryView
          key={currentPath}
          owner={owner}
          repo={repo}
          branch={branch}
          path={currentPath}
          filter={filter}
          onNavigate={navigateTo}
          onFileClick={onFileClick}
          selectedPath={selectedPath}
          token={token}
        />
      </ScrollArea>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-border/20 bg-muted/5 text-xs text-muted-foreground/40 font-mono flex items-center gap-2 flex-wrap">
        <span>Click files to preview</span>
        <span className="text-border">·</span>
        <span>Click folders to navigate</span>
        <span className="text-border">·</span>
        <FolderDown className="w-3 h-3 inline" />
        <span>downloads via download-directory.github.io</span>
      </div>
    </div>
  );
}
