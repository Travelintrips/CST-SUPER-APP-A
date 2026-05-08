import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import {
  X, Copy, CheckCheck, Download, ExternalLink, AlertCircle,
  FileCode, FileImage, FileArchive, Binary, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchFileContent, getLanguageFromPath, isBinaryPath, formatFileSize } from "@/lib/github";
import { cn } from "@/lib/utils";

interface FilePreviewProps {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  size: number;
  downloadUrl: string | null;
  htmlUrl: string;
  onClose: () => void;
}

const MAX_PREVIEW_BYTES = 500_000;

export function FilePreview({
  owner, repo, branch, path, size, downloadUrl, htmlUrl, onClose
}: FilePreviewProps) {
  const [copied, setCopied] = useState(false);
  const filename = path.split("/").pop() ?? path;
  const language = getLanguageFromPath(path);
  const isBinary = isBinaryPath(path);
  const isImage = /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp)$/i.test(path);
  const isTooBig = size > MAX_PREVIEW_BYTES;

  const { data: content, isLoading, error } = useQuery({
    queryKey: ["github", "file", owner, repo, branch, path],
    queryFn: () => fetchFileContent(owner, repo, branch, path),
    enabled: !isBinary && !isTooBig,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const lineCount = content ? content.split("\n").length : 0;

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-muted/10">
        <FileCode className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono font-medium text-foreground truncate" title={path}>
            {path}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {language !== "text" && (
              <Badge variant="secondary" className="text-xs font-mono px-1.5 py-0 h-5 capitalize">
                {language}
              </Badge>
            )}
            {size > 0 && (
              <span className="text-xs text-muted-foreground/60 font-mono">{formatFileSize(size)}</span>
            )}
            {content && (
              <span className="text-xs text-muted-foreground/60 font-mono">{lineCount.toLocaleString()} lines</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {content && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
              title="Copy content"
            >
              {copied ? <CheckCheck className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            </Button>
          )}
          {downloadUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleDownload}
              title="Download file"
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => window.open(htmlUrl, "_blank", "noopener,noreferrer")}
            title="View on GitHub"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title="Close preview"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="relative">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-mono">Loading file...</span>
          </div>
        )}

        {/* Binary / image files */}
        {!isLoading && isImage && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <img
              src={`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`}
              alt={filename}
              className="max-h-72 max-w-full object-contain rounded-lg border border-border/30 shadow-lg"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <p className="text-xs text-muted-foreground font-mono">{filename}</p>
          </div>
        )}

        {!isLoading && isBinary && !isImage && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <Binary className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Binary file — cannot preview</p>
            {downloadUrl && (
              <Button variant="outline" size="sm" onClick={handleDownload} className="mt-2 font-mono text-xs gap-2">
                <Download className="w-3.5 h-3.5" />
                Download instead
              </Button>
            )}
          </div>
        )}

        {/* Too big */}
        {!isLoading && isTooBig && !isBinary && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <AlertCircle className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              File is too large to preview ({formatFileSize(size)})
            </p>
            {downloadUrl && (
              <Button variant="outline" size="sm" onClick={handleDownload} className="mt-2 font-mono text-xs gap-2">
                <Download className="w-3.5 h-3.5" />
                Download instead
              </Button>
            )}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <AlertCircle className="w-10 h-10 text-destructive/40" />
            <p className="text-sm text-muted-foreground">
              {(error as Error)?.message || "Failed to load file"}
            </p>
          </div>
        )}

        {/* Code content */}
        {!isLoading && content !== undefined && (
          <ScrollArea className="h-96">
            <SyntaxHighlighter
              language={language === "text" ? undefined : language}
              style={atomOneDark}
              showLineNumbers={lineCount > 1}
              wrapLongLines={false}
              customStyle={{
                margin: 0,
                padding: "1rem",
                background: "transparent",
                fontSize: "0.78rem",
                lineHeight: "1.6",
                fontFamily: "Menlo, Monaco, 'Courier New', monospace",
              }}
              lineNumberStyle={{
                minWidth: "2.5em",
                paddingRight: "1em",
                color: "rgba(255,255,255,0.15)",
                userSelect: "none",
              }}
            >
              {content}
            </SyntaxHighlighter>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
