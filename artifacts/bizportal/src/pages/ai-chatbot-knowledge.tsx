import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Info,
  ToggleLeft,
  ToggleRight,
  X,
  Save,
} from "lucide-react";

interface KnowledgeEntry {
  id: number;
  title: string;
  category: string;
  content: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  { value: "umum", label: "Umum" },
  { value: "harga", label: "Harga & Tarif" },
  { value: "layanan", label: "Layanan" },
  { value: "prosedur", label: "Prosedur & SOP" },
  { value: "dokumen", label: "Dokumen & Syarat" },
  { value: "faq", label: "FAQ" },
  { value: "kebijakan", label: "Kebijakan" },
  { value: "kontak", label: "Kontak & Jam Operasional" },
];

const CATEGORY_COLORS: Record<string, string> = {
  umum: "bg-gray-100 text-gray-700",
  harga: "bg-green-100 text-green-700",
  layanan: "bg-blue-100 text-blue-700",
  prosedur: "bg-orange-100 text-orange-700",
  dokumen: "bg-purple-100 text-purple-700",
  faq: "bg-sky-100 text-sky-700",
  kebijakan: "bg-red-100 text-red-700",
  kontak: "bg-teal-100 text-teal-700",
};

interface FormState {
  title: string;
  category: string;
  content: string;
  sortOrder: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  category: "umum",
  content: "",
  sortOrder: "0",
};

export default function AiChatbotKnowledgePage() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    void loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-agent/knowledge-base", {
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as KnowledgeEntry[];
      setEntries(data);
    } catch {
      toast({ title: "Gagal memuat knowledge base", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(entry: KnowledgeEntry) {
    setEditingId(entry.id);
    setForm({
      title: entry.title,
      category: entry.category,
      content: entry.content,
      sortOrder: String(entry.sortOrder),
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      toast({ title: "Judul dan isi tidak boleh kosong", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        category: form.category,
        content: form.content.trim(),
        sortOrder: parseInt(form.sortOrder) || 0,
      };
      const url =
        editingId != null
          ? `/api/ai-agent/knowledge-base/${editingId}`
          : "/api/ai-agent/knowledge-base";
      const method = editingId != null ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast({ title: editingId != null ? "Entri diperbarui" : "Entri ditambahkan" });
      cancelForm();
      await loadEntries();
    } catch {
      toast({ title: "Gagal menyimpan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Hapus entri ini?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/ai-agent/knowledge-base/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      toast({ title: "Entri dihapus" });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      toast({ title: "Gagal menghapus", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(entry: KnowledgeEntry) {
    setTogglingId(entry.id);
    try {
      const res = await fetch(`/api/ai-agent/knowledge-base/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      if (!res.ok) throw new Error();
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id ? { ...e, isActive: !e.isActive } : e
        )
      );
    } catch {
      toast({ title: "Gagal mengubah status", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  }

  const filtered =
    filterCategory === "all"
      ? entries
      : entries.filter((e) => e.category === filterCategory);

  const activeCount = entries.filter((e) => e.isActive).length;

  const inp =
    "w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100 transition-all text-sm";

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Knowledge Base Chatbot</h1>
              <p className="text-sm text-gray-500">
                SOP, FAQ, dan informasi yang dijadikan referensi otomatis oleh chatbot
              </p>
            </div>
          </div>
          <Button
            onClick={openCreate}
            className="gap-2 bg-emerald-600 hover:bg-emerald-500 shrink-0"
            disabled={showForm}
          >
            <Plus className="h-4 w-4" />
            Tambah Entri
          </Button>
        </div>

        {/* Info card */}
        <div className="flex gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
          <div className="space-y-1">
            <p className="font-semibold">Cara kerja Knowledge Base:</p>
            <ul className="list-disc list-inside space-y-0.5 text-emerald-700">
              <li>Chatbot membaca semua entri <strong>aktif</strong> sebelum menjawab pertanyaan user</li>
              <li>Tulis SOP, FAQ, kebijakan, harga, atau prosedur khusus perusahaan Anda</li>
              <li>Semakin spesifik isinya, semakin akurat jawaban chatbot</li>
              <li>Entri tidak aktif diabaikan oleh chatbot tapi tetap tersimpan</li>
            </ul>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="border border-gray-100 bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-gray-800">{entries.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Entri</p>
          </div>
          <div className="border border-emerald-100 bg-emerald-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{activeCount}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Aktif</p>
          </div>
          <div className="border border-gray-100 bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-gray-400">{entries.length - activeCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">Nonaktif</p>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <Card className="border-emerald-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {editingId != null ? "Edit Entri" : "Tambah Entri Baru"}
                </CardTitle>
                <button
                  onClick={cancelForm}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                    Judul *
                  </label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Contoh: Tarif Sea Freight Surabaya-Jakarta"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                    Kategori
                  </label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Isi / Konten *
                </label>
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                  placeholder={`Contoh:\nTarif Sea Freight LCL Surabaya ke Jakarta:\n- Minimal 1 CBM: Rp 350.000/CBM\n- 1-5 CBM: Rp 300.000/CBM\n- Di atas 5 CBM: Rp 250.000/CBM\nHarga sudah termasuk handling fee. Belum termasuk bongkar muat.`}
                  className="min-h-[180px] text-sm font-mono resize-y"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {form.content.length} karakter
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Urutan
                  </label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                    className={`${inp} w-20`}
                    min="0"
                  />
                  <span className="text-xs text-gray-400">(kecil = prioritas lebih tinggi)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={cancelForm} disabled={saving}>
                    Batal
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-500"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Simpan
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterCategory("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterCategory === "all"
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            Semua ({entries.length})
          </button>
          {CATEGORIES.filter((c) =>
            entries.some((e) => e.category === c.value)
          ).map((c) => (
            <button
              key={c.value}
              onClick={() => setFilterCategory(c.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterCategory === c.value
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {c.label} ({entries.filter((e) => e.category === c.value).length})
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="h-12 w-12 text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-500">Belum ada entri</p>
            <p className="text-xs text-gray-400 mt-1">
              Klik &quot;Tambah Entri&quot; untuk mulai mengisi knowledge base chatbot Anda
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((entry) => (
              <Card
                key={entry.id}
                className={`transition-all duration-200 ${
                  !entry.isActive ? "opacity-50" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            CATEGORY_COLORS[entry.category] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {CATEGORIES.find((c) => c.value === entry.category)?.label ??
                            entry.category}
                        </span>
                        {!entry.isActive && (
                          <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            Nonaktif
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400">
                          #{entry.sortOrder}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-800 truncate">
                        {entry.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                        {entry.content}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleActive(entry)}
                        disabled={togglingId === entry.id}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        title={entry.isActive ? "Nonaktifkan" : "Aktifkan"}
                      >
                        {togglingId === entry.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : entry.isActive ? (
                          <ToggleRight className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <ToggleLeft className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => openEdit(entry)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deletingId === entry.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Hapus"
                      >
                        {deletingId === entry.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
