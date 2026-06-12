import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { getAuthToken } from "@/lib/auth";
import { FolderOpen, FileText, Download, Search, Filter, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PortalDokumen() {
  const [, setLocation] = useLocation();
  const token = getAuthToken();

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  if (!token) return null;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 py-8">
      <div className="container px-4 md:px-6 max-w-5xl">

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Dokumen</h1>
          <p className="text-slate-500 mt-1">Kelola dokumen pengiriman, Bill of Lading, dan dokumen kepabeanan Anda</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Cari dokumen..." className="pl-9" disabled />
          </div>
          <Button variant="outline" className="gap-2" disabled>
            <Filter className="h-4 w-4" /> Filter
          </Button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-sky-600" />
            <h2 className="font-semibold text-slate-800">Semua Dokumen</h2>
          </div>

          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-sky-50 flex items-center justify-center mb-4">
              <Clock className="h-8 w-8 text-sky-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Segera Hadir</h3>
            <p className="text-slate-400 text-sm max-w-sm">
              Halaman dokumen sedang dalam pengembangan. Anda akan bisa mengakses Bill of Lading,
              Packing List, Commercial Invoice, dan dokumen lainnya di sini.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {["Bill of Lading", "Packing List", "Commercial Invoice", "Customs Doc", "POD"].map((doc) => (
                <span key={doc} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium">
                  <FileText className="h-3 w-3 inline mr-1" />{doc}
                </span>
              ))}
            </div>
            <Link href="/orders" className="mt-6">
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Lihat Order & Dokumen
              </Button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
