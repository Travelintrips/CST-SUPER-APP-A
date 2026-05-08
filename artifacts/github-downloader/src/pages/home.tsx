import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Download, Copy, AlertCircle, CheckCircle2, History, Star, GitFork, Clock, BookOpen, TerminalSquare, Github, ChevronRight, XCircle, ArrowRight, FolderTree, SearchCode, Eye, Loader2, Lock } from "lucide-react";
import { parseGitHubUrl, getZipDownloadUrl, ParsedGitHubUrl, GitHubContentItem, CodeSearchItem, checkIsStarred, starRepo, unstarRepo } from "@/lib/github";
import { useGitHubRepo, useGitHubBranches } from "@/hooks/use-github";
import { useHistory } from "@/hooks/use-history";
import { useGitHubToken } from "@/hooks/use-github-token";
import { FileBrowser } from "@/components/file-browser";
import { FilePreview } from "@/components/file-preview";
import { CodeSearch } from "@/components/code-search";
import { TokenDialog } from "@/components/token-dialog";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [parsedUrl, setParsedUrl] = useState<ParsedGitHubUrl | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [isCopied, setIsCopied] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showCodeSearch, setShowCodeSearch] = useState(false);
  const [selectedFile, setSelectedFile] = useState<GitHubContentItem | null>(null);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const { token, setToken, clearToken, isAuthenticated } = useGitHubToken();
  const { history, addToHistory, clearHistory } = useHistory();

  // Star state — null = unknown, true/false = known
  const [isStarred, setIsStarred] = useState<boolean | null>(null);
  const [isStarring, setIsStarring] = useState(false);
  const [localStarCount, setLocalStarCount] = useState<number | null>(null);

  const { 
    data: repoData, 
    isLoading: isLoadingRepo, 
    error: repoError,
    isError: isRepoError
  } = useGitHubRepo(parsedUrl?.owner || "", parsedUrl?.repo || "", !!parsedUrl?.isValid, token || undefined);

  const {
    data: branchesData,
    isLoading: isLoadingBranches
  } = useGitHubBranches(parsedUrl?.owner || "", parsedUrl?.repo || "", !!parsedUrl?.isValid && !!repoData, token || undefined);

  // Check star status when repo + token become available
  useEffect(() => {
    if (!repoData || !token) {
      setIsStarred(null);
      return;
    }
    let cancelled = false;
    checkIsStarred(repoData.owner.login, repoData.name, token)
      .then((starred) => { if (!cancelled) setIsStarred(starred); })
      .catch(() => { if (!cancelled) setIsStarred(null); });
    return () => { cancelled = true; };
  }, [repoData, token]);

  // Sync local star count with fresh repo data
  useEffect(() => {
    if (repoData) setLocalStarCount(repoData.stargazers_count);
  }, [repoData]);

  const handleToggleStar = useCallback(async () => {
    if (!repoData || !token || isStarring) return;
    setIsStarring(true);
    const wasStarred = isStarred;
    // Optimistic update
    setIsStarred(!wasStarred);
    setLocalStarCount((c) => (c ?? repoData.stargazers_count) + (wasStarred ? -1 : 1));
    try {
      if (wasStarred) {
        await unstarRepo(repoData.owner.login, repoData.name, token);
        toast({ title: "Unstarred", description: `${repoData.full_name} removed from your stars.` });
      } else {
        await starRepo(repoData.owner.login, repoData.name, token);
        toast({ title: "Starred!", description: `${repoData.full_name} added to your stars.`, className: "bg-primary text-primary-foreground border-primary" });
      }
    } catch (err) {
      // Revert on failure
      setIsStarred(wasStarred);
      setLocalStarCount((c) => (c ?? repoData.stargazers_count) + (wasStarred ? 1 : -1));
      toast({ title: "Action failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsStarring(false);
    }
  }, [repoData, token, isStarred, isStarring, toast]);

  // Set default branch when repo data loads
  useEffect(() => {
    if (repoData && !selectedBranch) {
      setSelectedBranch(parsedUrl?.branch || repoData.default_branch);
      // Only add to history once we successfully loaded the repo
      addToHistory(repoData.owner.login, repoData.name);
    }
  }, [repoData, parsedUrl, selectedBranch, addToHistory]);

  const handleProcessUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;

    const parsed = parseGitHubUrl(inputValue);
    if (!parsed.isValid) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid GitHub repository URL or owner/repo format.",
        variant: "destructive"
      });
      return;
    }

    setParsedUrl(parsed);
    setSelectedBranch("");
    setIsCopied(false);
    setShowFileBrowser(false);
    setShowCodeSearch(false);
    setSelectedFile(null);
    setIsStarred(null);
    setLocalStarCount(null);
  };

  const handleDownload = () => {
    if (!repoData || !selectedBranch) return;
    
    const url = getZipDownloadUrl(repoData.owner.login, repoData.name, selectedBranch);
    window.open(url, '_blank');
    
    toast({
      title: "Download Started",
      description: `Downloading ${repoData.name} (${selectedBranch})`,
      className: "bg-primary text-primary-foreground border-primary",
    });
  };

  const handleCopyLink = async () => {
    if (!repoData || !selectedBranch) return;
    
    const url = getZipDownloadUrl(repoData.owner.login, repoData.name, selectedBranch);
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        description: "ZIP download URL has been copied.",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard.",
        variant: "destructive"
      });
    }
  };

  const loadFromHistory = (owner: string, repo: string) => {
    const url = `https://github.com/${owner}/${repo}`;
    setInputValue(url);
    const parsed = parseGitHubUrl(url);
    setParsedUrl(parsed);
    setSelectedBranch("");
    setIsCopied(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetState = () => {
    setInputValue("");
    setParsedUrl(null);
    setSelectedBranch("");
    setIsCopied(false);
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center py-12 px-4 sm:px-6 md:py-24 relative overflow-hidden">
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMiIvPjwvc3ZnPg==')] opacity-30 mix-blend-overlay" />
      </div>

      <div className="w-full max-w-2xl z-10 flex flex-col gap-8">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="p-3 bg-card border border-border rounded-xl shadow-lg shadow-black/50 glow-cyan">
            <Github className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground font-mono">
            dl<span className="text-primary">.</span>repo
          </h1>
          <p className="text-muted-foreground text-lg max-w-lg">
            Download any GitHub repository as a ZIP archive instantly. Fast, precise, and native.
          </p>
          <TokenDialog
            token={token}
            isAuthenticated={isAuthenticated}
            onSave={setToken}
            onClear={clearToken}
          />
        </div>

        {/* Search Input */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-xl shadow-xl animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 overflow-hidden">
          <CardContent className="p-2 sm:p-3">
            <form onSubmit={handleProcessUrl} className="flex gap-2">
              <div className="relative flex-1 group">
                <TerminalSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input 
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="owner/repo or https://github.com/..."
                  className="pl-10 py-6 text-lg bg-background/50 border-transparent focus-visible:ring-primary font-mono placeholder:text-muted-foreground/50 transition-all rounded-lg"
                  autoFocus
                />
                {inputValue && (
                  <button 
                    type="button" 
                    onClick={resetState}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                )}
              </div>
              <Button 
                type="submit" 
                size="lg" 
                className="h-auto py-4 px-6 md:px-8 font-semibold text-primary-foreground bg-primary hover:bg-primary/90 hover-elevate transition-all shadow-[0_0_15px_rgba(var(--primary)_/_0.3)]"
                disabled={!inputValue.trim()}
              >
                <span className="hidden sm:inline">Resolve</span>
                <ArrowRight className="w-5 h-5 sm:ml-2" />
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Results Area */}
        <div className="min-h-[300px]">
          
          {/* Loading State */}
          {parsedUrl?.isValid && isLoadingRepo && (
            <Card className="animate-in fade-in zoom-in-95 duration-300 border-primary/20 shadow-lg shadow-primary/5">
              <CardHeader className="pb-4">
                <Skeleton className="h-8 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardHeader>
              <CardContent className="pb-6">
                <div className="flex gap-4">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </CardContent>
              <CardFooter className="bg-muted/20 border-t border-border/50 gap-4 pt-6">
                <Skeleton className="h-12 flex-1" />
                <Skeleton className="h-12 w-12" />
              </CardFooter>
            </Card>
          )}

          {/* Error State */}
          {parsedUrl?.isValid && isRepoError && (
            <Card className="border-destructive/30 bg-destructive/5 animate-in fade-in zoom-in-95 duration-300">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-3 bg-destructive/10 rounded-full mb-4">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-foreground">Repository Not Found</h3>
                <p className="text-muted-foreground mb-6 max-w-md">
                  {(repoError as Error)?.message || "Make sure the URL is correct and the repository is public."}
                </p>
                <Button variant="outline" onClick={resetState} className="font-mono">
                  Try another URL
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Success State - Repo Info */}
          {parsedUrl?.isValid && repoData && !isRepoError && (
            <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500 border-primary/20 shadow-lg shadow-primary/5 overflow-hidden group">
              
              <CardHeader className="pb-4 relative">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                  <Github className="w-32 h-32" />
                </div>
                
                <div className="flex justify-between items-start gap-4 relative z-10">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-2xl font-bold flex items-center gap-2 flex-wrap mb-2">
                      <a 
                        href={repoData.html_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="hover:text-primary transition-colors font-mono"
                      >
                        {repoData.full_name}
                      </a>
                      {repoData.private && (
                        <Badge variant="outline" className="text-xs font-mono border-amber-500/40 text-amber-400 gap-1">
                          <Lock className="w-2.5 h-2.5" /> Private
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-base text-foreground/80 leading-relaxed max-w-xl">
                      {repoData.description || "No description provided."}
                    </CardDescription>
                  </div>

                  {/* Action buttons: Star / Watch / Fork */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {/* Star */}
                    <button
                      onClick={isAuthenticated ? handleToggleStar : undefined}
                      disabled={isStarring}
                      title={!isAuthenticated ? "Add a GitHub token to star repos" : isStarred ? "Unstar this repo" : "Star this repo"}
                      className={`group/star flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-mono transition-all select-none ${
                        !isAuthenticated
                          ? "border-border/30 text-muted-foreground/40 cursor-not-allowed"
                          : isStarred
                          ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 cursor-pointer"
                          : "border-border/40 text-muted-foreground hover:border-yellow-500/40 hover:text-yellow-400 cursor-pointer"
                      }`}
                    >
                      {isStarring ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Star className={`w-3.5 h-3.5 transition-all ${isStarred ? "fill-yellow-400 text-yellow-400" : ""}`} />
                      )}
                      <span className="tabular-nums">
                        {(localStarCount ?? repoData.stargazers_count).toLocaleString()}
                      </span>
                    </button>

                    {/* Watch */}
                    <a
                      href={`${repoData.html_url}/subscription`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Manage watch settings on GitHub"
                      className="flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-sm font-mono text-muted-foreground hover:border-sky-500/40 hover:text-sky-400 transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Watch</span>
                    </a>

                    {/* Fork */}
                    <a
                      href={`${repoData.html_url}/fork`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Fork this repo on GitHub"
                      className="flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-sm font-mono text-muted-foreground hover:border-violet-500/40 hover:text-violet-400 transition-all"
                    >
                      <GitFork className="w-3.5 h-3.5" />
                      <span>{repoData.forks_count.toLocaleString()}</span>
                    </a>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pb-6 relative z-10">
                <div className="flex flex-wrap gap-3 mb-6">
                  {repoData.language && (
                    <Badge variant="secondary" className="font-mono px-3 py-1 bg-secondary/80">
                      <div className="w-2 h-2 rounded-full bg-primary mr-2" />
                      {repoData.language}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="font-mono px-3 py-1 bg-secondary/80">
                    <Star className="w-3 h-3 mr-2 text-yellow-500" />
                    {(localStarCount ?? repoData.stargazers_count).toLocaleString()}
                  </Badge>
                  <Badge variant="secondary" className="font-mono px-3 py-1 bg-secondary/80">
                    <GitFork className="w-3 h-3 mr-2" />
                    {repoData.forks_count.toLocaleString()}
                  </Badge>
                  <Badge variant="secondary" className="font-mono px-3 py-1 bg-secondary/80">
                    <Clock className="w-3 h-3 mr-2" />
                    {formatDistanceToNow(new Date(repoData.updated_at), { addSuffix: true })}
                  </Badge>
                  {repoData.license && (
                    <Badge variant="secondary" className="font-mono px-3 py-1 bg-secondary/80">
                      <BookOpen className="w-3 h-3 mr-2" />
                      {repoData.license.spdx_id}
                    </Badge>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Target Branch</label>
                  {isLoadingBranches ? (
                    <Skeleton className="h-12 w-full" />
                  ) : (
                    <Select 
                      value={selectedBranch} 
                      onValueChange={setSelectedBranch}
                    >
                      <SelectTrigger className="w-full h-12 bg-background font-mono text-base border-border/50">
                        <SelectValue placeholder="Select a branch" />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-64">
                          {branchesData?.map((branch) => (
                            <SelectItem key={branch.name} value={branch.name} className="font-mono">
                              {branch.name}
                              {branch.name === repoData.default_branch && (
                                <span className="ml-2 text-xs text-primary uppercase bg-primary/10 px-2 py-0.5 rounded">Default</span>
                              )}
                            </SelectItem>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardContent>

              <CardFooter className="bg-muted/10 border-t border-border/30 pt-6 gap-3 flex flex-col sm:flex-row relative z-10">
                <Button 
                  onClick={handleDownload}
                  disabled={!selectedBranch}
                  size="lg"
                  className="w-full sm:flex-1 h-14 text-lg font-semibold shadow-lg hover-elevate transition-all"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Download ZIP
                </Button>
                <Button 
                  onClick={handleCopyLink}
                  disabled={!selectedBranch}
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto h-14 px-6 bg-background hover:bg-muted"
                >
                  {isCopied ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 mr-2 text-primary" />
                      <span className="text-primary">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5 mr-2" />
                      Copy Link
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setShowFileBrowser((v) => !v)}
                  disabled={!selectedBranch}
                  variant="outline"
                  size="lg"
                  className={`w-full sm:w-auto h-14 px-6 bg-background hover:bg-muted transition-colors ${showFileBrowser ? "border-primary/50 text-primary" : ""}`}
                  title="Browse files"
                >
                  <FolderTree className="w-5 h-5 sm:mr-2" />
                  <span className="hidden sm:inline">Browse Files</span>
                </Button>
                <Button
                  onClick={() => setShowCodeSearch((v) => !v)}
                  disabled={!selectedBranch}
                  variant="outline"
                  size="lg"
                  className={`w-full sm:w-auto h-14 px-6 bg-background hover:bg-muted transition-colors ${showCodeSearch ? "border-primary/50 text-primary" : ""}`}
                  title="Search code"
                >
                  <SearchCode className="w-5 h-5 sm:mr-2" />
                  <span className="hidden sm:inline">Search Code</span>
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* File Browser Panel */}
          {parsedUrl?.isValid && repoData && selectedBranch && showFileBrowser && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <FileBrowser
                owner={repoData.owner.login}
                repo={repoData.name}
                branch={selectedBranch}
                onFileClick={(item) => {
                  setSelectedFile(item);
                }}
                selectedPath={selectedFile?.path}
                token={token || undefined}
              />
            </div>
          )}

          {/* File Preview Panel — shown for both browser and search selections */}
          {parsedUrl?.isValid && repoData && selectedBranch && selectedFile && (showFileBrowser || showCodeSearch) && (
            <FilePreview
              key={selectedFile.path}
              owner={repoData.owner.login}
              repo={repoData.name}
              branch={selectedBranch}
              path={selectedFile.path}
              size={selectedFile.size}
              downloadUrl={selectedFile.download_url}
              htmlUrl={selectedFile.html_url}
              onClose={() => setSelectedFile(null)}
              token={token || undefined}
            />
          )}

          {/* Code Search Panel */}
          {parsedUrl?.isValid && repoData && selectedBranch && showCodeSearch && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <CodeSearch
                owner={repoData.owner.login}
                repo={repoData.name}
                branch={selectedBranch}
                selectedPath={selectedFile?.path}
                token={token || undefined}
                onFileSelect={(item: CodeSearchItem) => {
                  const rawUrl = `https://raw.githubusercontent.com/${repoData.owner.login}/${repoData.name}/${selectedBranch}/${item.path}`;
                  setSelectedFile({
                    name: item.name,
                    path: item.path,
                    type: "file",
                    size: 0,
                    sha: item.sha,
                    download_url: rawUrl,
                    html_url: item.html_url,
                  });
                }}
              />
            </div>
          )}

          {/* History State */}
          {!parsedUrl?.isValid && history.length > 0 && (
            <div className="animate-in fade-in duration-700 delay-200 pt-8">
              <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <History className="w-4 h-4" /> Recent Downloads
                </h3>
                <Button variant="ghost" size="sm" onClick={clearHistory} className="h-8 text-xs text-muted-foreground hover:text-destructive">
                  Clear
                </Button>
              </div>
              <div className="grid gap-3">
                {history.map((item, i) => (
                  <div 
                    key={`${item.id}-${item.timestamp}`}
                    className="group flex items-center justify-between p-4 rounded-xl border border-border/40 bg-card/40 hover:bg-card hover:border-primary/30 transition-all cursor-pointer animate-in slide-in-from-bottom-2 fade-in"
                    style={{ animationDelay: `${i * 50 + 300}ms`, animationFillMode: 'both' }}
                    onClick={() => loadFromHistory(item.owner, item.repo)}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 rounded-md bg-muted group-hover:bg-primary/10 transition-colors shrink-0">
                        <Github className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="truncate">
                        <p className="font-mono text-sm font-medium text-foreground truncate">
                          <span className="text-muted-foreground">{item.owner}/</span>{item.repo}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary transform translate-x-[-10px] group-hover:translate-x-0 transition-all" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State / Instructions */}
          {!parsedUrl?.isValid && history.length === 0 && (
            <div className="text-center pt-16 pb-8 animate-in fade-in duration-1000 delay-300">
              <div className="inline-flex items-center justify-center p-4 rounded-full bg-muted/30 mb-6">
                <Search className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-xl font-medium text-foreground mb-3">Ready to extract</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Paste any GitHub repository URL above. We'll fetch the details and prepare a direct ZIP download link.
              </p>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <footer className="mt-auto pt-16 pb-8 text-center text-sm text-muted-foreground/50 font-mono w-full">
        Powered by GitHub Public API • No authentication required
      </footer>
    </div>
  );
}
