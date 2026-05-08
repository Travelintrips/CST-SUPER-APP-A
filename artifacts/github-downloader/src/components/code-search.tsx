import { useState, useRef, KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Loader2, AlertCircle, FileCode, FileText, FileImage,
  FileArchive, ChevronRight, X, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCodeSearch, CodeSearchItem, getLanguageFromPath } from "@/lib/github";
import { cn } from "@/lib/utils";

interface CodeSearchProps {
  owner: string;
  repo: string;
  branch: string;
  onFileSelect: (item: CodeSearchItem) => void;
  selectedPath?: string;
}

const CODE_EXTS = new Set([
  "ts","tsx","js","jsx","py","rb","go","rs","java","c","cpp",
  "cs","php","swift","kt","sh","bash","yaml","yml","json","toml",
  "html","css","scss","md","mdx","sql","graphql","tf","env","ini",
]);
const IMAGE_EXTS = new Set(["png","jpg","jpeg","gif","svg","webp","ico","bmp"]);
const ARCHIVE_EXTS = new Set(["zip","tar","gz","rar","7z","bz2","xz"]);

function getResultIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) return <FileImage className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (ARCHIVE_EXTS.has(ext)) return <FileArchive className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  if (CODE_EXTS.has(ext)) return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  return <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

function highlightMatch(fragment: string, matches: Array<{ text: string; indices: [number, number] }>) {
  if (!matches.length) return <span className="text-muted-foreground/70">{fragment}</span>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    const [start, end] = match.indices;
    if (cursor < start) {
      parts.push(<span key={cursor} className="text-muted-foreground/60">{fragment.slice(cursor, start)}</span>);
    }
    parts.push(
      <mark key={start} className="bg-primary/20 text-primary font-medium rounded-sm px-0.5">
        {fragment.slice(start, end)}
      </mark>
    );
    cursor = end;
  }
  if (cursor < fragment.length) {
    parts.push(<span key={cursor} className="text-muted-foreground/60">{fragment.slice(cursor)}</span>);
  }

  return <>{parts}</>;
}

interface ResultItemProps {
  item: CodeSearchItem;
  isSelected: boolean;
  onSelect: () => void;
}

function ResultItem({ item, isSelected, onSelect }: ResultItemProps) {
  const lang = getLanguageFromPath(item.path);
  const pathParts = item.path.split("/");
  const filename = pathParts.pop() ?? item.name;
  const dir = pathParts.join("/");
  const snippet = item.text_matches?.[0];

  return (
    <div
      className={cn(
        "group px-4 py-3 cursor-pointer border-b border-border/20 transition-colors",
        isSelected ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/20"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        {getResultIcon(item.name)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn(
              "text-sm font-mono font-medium truncate",
              isSelected ? "text-primary" : "text-foreground"
            )}>
              {filename}
            </span>
            {lang !== "text" && (
              <Badge variant="secondary" className="text-xs font-mono px-1.5 py-0 h-4 capitalize shrink-0">
                {lang}
              </Badge>
            )}
          </div>
          {dir && (
            <p className="text-xs font-mono text-muted-foreground/50 truncate mb-1.5">
              {dir}/
            </p>
          )}
          {snippet && snippet.fragment && (
            <pre className="text-xs font-mono bg-muted/20 rounded px-2 py-1.5 overflow-hidden whitespace-pre-wrap break-all leading-relaxed max-h-16 line-clamp-3">
              {highlightMatch(snippet.fragment.trim(), snippet.matches)}
            </pre>
          )}
        </div>
        <ChevronRight className={cn(
          "w-4 h-4 shrink-0 mt-0.5 transition-opacity",
          isSelected ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"
        )} />
      </div>
    </div>
  );
}

export function CodeSearch({ owner, repo, branch, onFileSelect, selectedPath }: CodeSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, isError } = useQuery({
    queryKey: ["github", "search", owner, repo, committedQuery],
    queryFn: () => fetchCodeSearch(owner, repo, committedQuery),
    enabled: committedQuery.trim().length >= 2,
    retry: false,
    staleTime: 1000 * 60 * 2,
  });

  const handleSearch = () => {
    const q = inputValue.trim();
    if (q.length >= 2) setCommittedQuery(q);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleClear = () => {
    setInputValue("");
    setCommittedQuery("");
    inputRef.current?.focus();
  };

  const hasResults = data && data.items.length > 0;
  const noResults = data && data.items.length === 0;

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
      {/* Search input bar */}
      <div className="p-3 border-b border-border/30 bg-muted/10">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Search code in ${repo}...`}
              className="pl-8 pr-8 h-9 text-sm bg-background/40 border-border/30 font-mono placeholder:text-muted-foreground/40"
              autoFocus
            />
            {inputValue && (
              <button
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            size="sm"
            className="h-9 px-4 font-mono text-xs shrink-0"
            onClick={handleSearch}
            disabled={inputValue.trim().length < 2 || isLoading}
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Search"}
          </Button>
        </div>

        {/* Result count */}
        {data && committedQuery && (
          <div className="flex items-center gap-2 mt-2 px-1">
            <span className="text-xs text-muted-foreground font-mono">
              {data.total_count === 0
                ? "No results"
                : `${data.items.length} of ${data.total_count.toLocaleString()} result${data.total_count !== 1 ? "s" : ""}`}
              {committedQuery && <span className="text-muted-foreground/50"> for "{committedQuery}"</span>}
            </span>
            {data.incomplete_results && (
              <Badge variant="secondary" className="text-xs h-4 px-1.5">partial</Badge>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <ScrollArea className="h-80">
        {/* Idle / prompt */}
        {!committedQuery && (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
            <Search className="w-8 h-8 text-muted-foreground/20" />
            <div>
              <p className="text-sm text-muted-foreground">Search code across the repository</p>
              <p className="text-xs text-muted-foreground/50 mt-1 font-mono">Type at least 2 characters and press Enter</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="divide-y divide-border/20">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Skeleton className="w-3.5 h-3.5 rounded" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-3 w-40 mb-2" />
                <Skeleton className="h-10 w-full rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-6">
            <AlertCircle className="w-8 h-8 text-destructive/40" />
            <p className="text-sm text-muted-foreground">
              {(error as Error)?.message || "Search failed"}
            </p>
          </div>
        )}

        {/* No results */}
        {noResults && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-6">
            <Search className="w-8 h-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              No files found containing "{committedQuery}"
            </p>
            <p className="text-xs text-muted-foreground/50 font-mono">Try a different keyword</p>
          </div>
        )}

        {/* Results list */}
        {hasResults && !isLoading && (
          <div>
            {data.items.map((item) => (
              <ResultItem
                key={item.sha + item.path}
                item={item}
                isSelected={selectedPath === item.path}
                onSelect={() => onFileSelect(item)}
              />
            ))}
            {data.total_count > data.items.length && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground/50 font-mono border-t border-border/20">
                <Info className="w-3 h-3" />
                {data.total_count - data.items.length} more results — refine your query to narrow down
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/20 bg-muted/5 text-xs text-muted-foreground/40 font-mono">
        Powered by GitHub Code Search API · public repos only
      </div>
    </div>
  );
}
