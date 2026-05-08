import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Key, Eye, EyeOff, CheckCircle2, XCircle, Loader2,
  ExternalLink, Trash2, Shield, Zap, Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetchRateLimit, RateLimitResponse } from "@/lib/github";

interface TokenDialogProps {
  token: string;
  isAuthenticated: boolean;
  onSave: (token: string) => void;
  onClear: () => void;
}

function RateLimitBar({ used, limit }: { used: number; limit: number }) {
  const remaining = limit - used;
  const pct = Math.max(0, Math.min(100, (remaining / limit) * 100));
  const color = pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono text-muted-foreground">
        <span>{remaining.toLocaleString()} remaining</span>
        <span>{limit.toLocaleString()} total</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TokenDialog({ token, isAuthenticated, onSave, onClear }: TokenDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(token);
  const [showToken, setShowToken] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<"ok" | "error" | null>(null);
  const [validationMsg, setValidationMsg] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(token);
      setValidationResult(null);
      setValidationMsg("");
      setShowToken(false);
    }
  }, [open, token]);

  const { data: rateLimit, isLoading: isLoadingRate, refetch: refetchRate } = useQuery<RateLimitResponse>({
    queryKey: ["github", "rateLimit", token],
    queryFn: () => fetchRateLimit(token || undefined),
    enabled: open,
    staleTime: 1000 * 30,
    retry: false,
  });

  const handleValidate = async () => {
    const t = draft.trim();
    if (!t) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const user = await res.json();
        setValidationResult("ok");
        setValidationMsg(`Authenticated as @${user.login}`);
      } else if (res.status === 401) {
        setValidationResult("error");
        setValidationMsg("Invalid token — check it and try again");
      } else {
        setValidationResult("error");
        setValidationMsg(`Unexpected error: ${res.statusText}`);
      }
    } catch {
      setValidationResult("error");
      setValidationMsg("Network error — could not validate token");
    } finally {
      setValidating(false);
    }
  };

  const handleSave = () => {
    onSave(draft.trim());
    refetchRate();
    setOpen(false);
  };

  const handleClear = () => {
    onClear();
    setDraft("");
    setValidationResult(null);
    refetchRate();
  };

  const maskedToken = token ? token.slice(0, 7) + "•".repeat(Math.min(24, token.length - 7)) : "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 gap-1.5 font-mono text-xs border-border/40 ${
            isAuthenticated
              ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          {isAuthenticated ? "Authenticated" : "Add Token"}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Key className="w-4 h-4" />
            GitHub Personal Access Token
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Add a token to increase rate limits, search private repos, and access more features.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Benefits */}
          <div className="grid grid-cols-1 gap-2">
            {[
              { icon: Zap, color: "text-amber-400", label: "60 core API requests / hour → 5,000 with token" },
              { icon: Shield, color: "text-sky-400", label: "10 code searches / min → 30 with token" },
              { icon: Lock, color: "text-violet-400", label: "Access your private repositories" },
            ].map(({ icon: Icon, color, label }) => (
              <div key={label} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                <span>{label}</span>
              </div>
            ))}
          </div>

          {/* Current rate limits */}
          <div className="rounded-lg border border-border/30 bg-muted/10 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Rate Limits</span>
              {isLoadingRate && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/40" />}
            </div>
            {rateLimit ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground/70 font-mono">Core API</span>
                  <RateLimitBar used={rateLimit.resources.core.used} limit={rateLimit.resources.core.limit} />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground/70 font-mono">Code Search</span>
                  <RateLimitBar used={rateLimit.resources.search.used} limit={rateLimit.resources.search.limit} />
                </div>
              </div>
            ) : (
              !isLoadingRate && (
                <p className="text-xs text-muted-foreground/50 font-mono">Could not load rate limit info</p>
              )
            )}
          </div>

          {/* Token input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Personal Access Token
            </label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setValidationResult(null); }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="pr-10 font-mono text-sm bg-background/40 border-border/30"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Validation feedback */}
            {validationResult === "ok" && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {validationMsg}
              </div>
            )}
            {validationResult === "error" && (
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <XCircle className="w-3.5 h-3.5" />
                {validationMsg}
              </div>
            )}

            {/* Existing saved token badge */}
            {isAuthenticated && !draft && (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="font-mono text-xs px-2">
                  {maskedToken}
                </Badge>
                <span className="text-xs text-muted-foreground/50">currently saved</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8"
              onClick={handleValidate}
              disabled={!draft.trim() || validating}
            >
              {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              {validating ? "Checking..." : "Verify"}
            </Button>

            <Button
              size="sm"
              className="text-xs h-8 flex-1"
              onClick={handleSave}
              disabled={!draft.trim()}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Save Token
            </Button>

            {isAuthenticated && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={handleClear}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {/* Link to create token */}
          <a
            href="https://github.com/settings/tokens/new?description=GitHub+Downloader&scopes=repo,read:user"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Create a new token on GitHub
          </a>

          <p className="text-xs text-muted-foreground/40 font-mono">
            Token is stored in your browser's local storage only — never sent anywhere except GitHub's API.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
