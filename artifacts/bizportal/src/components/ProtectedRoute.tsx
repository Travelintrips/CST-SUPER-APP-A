import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";

function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
    </div>
  );
}

function LoginScreen() {
  const { signInWithGoogle } = useSupabaseAuth();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold shadow-lg">
          B
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">BizPortal</h1>
        <p className="text-sm text-slate-400">Sistem ERP Internal CST Logistics</p>
      </div>
      <button
        onClick={signInWithGoogle}
        className="flex items-center justify-center gap-3 rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-slate-800 shadow hover:bg-slate-100 active:scale-95 transition-all"
      >
        Masuk dengan Google
      </button>
    </div>
  );
}

export function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useSupabaseAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <LoginScreen />;
  return <Component />;
}
