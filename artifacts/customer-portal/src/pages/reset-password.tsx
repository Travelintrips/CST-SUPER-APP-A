import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError("Link reset password tidak valid. Silakan minta ulang.");
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/portal/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Terjadi kesalahan. Coba lagi.");
      } else {
        setSuccess(true);
        setTimeout(() => setLocation("/login"), 3000);
      }
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
          <CardDescription>Masukkan password baru Anda di bawah ini.</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Password berhasil diubah. Silakan login kembali.
                </AlertDescription>
              </Alert>
              <p className="text-sm text-muted-foreground text-center">
                Anda akan diarahkan ke halaman login...
              </p>
              <Button className="w-full" onClick={() => setLocation("/login")}>
                Ke Halaman Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="password">Password Baru</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    placeholder="Minimal 8 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={!token || loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password.length > 0 && password.length < 8 && (
                  <p className="text-xs text-destructive">Minimal 8 karakter</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Konfirmasi Password Baru</Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type={showCf ? "text" : "password"}
                    placeholder="Ulangi password baru"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={!token || loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCf((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirm.length > 0 && confirm !== password && (
                  <p className="text-xs text-destructive">Password tidak cocok</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-11"
                disabled={!token || loading}
              >
                {loading ? "Menyimpan..." : "Simpan Password Baru"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Ingat password?{" "}
                <button
                  type="button"
                  onClick={() => setLocation("/login")}
                  className="font-medium text-accent hover:underline"
                >
                  Login
                </button>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
