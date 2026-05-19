import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, Package, Truck, Calculator, Settings, Building2,
  Users, TrendingUp, ShoppingBag, FileText, Receipt, ClipboardList,
  UserCircle, BookOpen, Wallet, FileSpreadsheet, Landmark, Mail,
  Ship, Boxes, DollarSign, Tags, BarChart2,
  GitMerge, Bot, ScanLine, MessageCircle, Layers, ImageIcon,
  Warehouse, LayoutGrid, PackageSearch, ArrowLeftRight, ClipboardCheck,
  Activity, FlaskConical, GitBranch, RotateCcw, AlertTriangle,
  PackageCheck, FileBarChart2, ShieldCheck, Shield, Calendar,
  CalendarDays, Dumbbell, Network, Clock, X, type LucideIcon,
} from "lucide-react";

interface CommandEntry {
  title: string;
  href: string;
  icon: LucideIcon;
  group: string;
}

const COMMANDS: CommandEntry[] = [
  // ── Utama ──
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Utama" },
  { title: "POS Kasir", href: "/pos-kasir", icon: Calculator, group: "Utama" },
  { title: "Settings", href: "/settings", icon: Settings, group: "Utama" },

  // ── Produk & Recipe ──
  { title: "Produk / Bahan Baku", href: "/products/items", icon: PackageSearch, group: "Produk & Recipe" },
  { title: "Recipe / BOM", href: "/products/recipes", icon: FlaskConical, group: "Produk & Recipe" },

  // ── Inventory ──
  { title: "Gudang", href: "/pos-inventory/warehouses", icon: Warehouse, group: "Inventory" },
  { title: "Rak", href: "/pos-inventory/racks", icon: LayoutGrid, group: "Inventory" },
  { title: "Stok", href: "/pos-inventory/stocks", icon: Boxes, group: "Inventory" },
  { title: "Transfer Stok", href: "/pos-inventory/transfers", icon: ArrowLeftRight, group: "Inventory" },
  { title: "Retur Barang", href: "/pos-inventory/returns", icon: RotateCcw, group: "Inventory" },
  { title: "Barang Rusak / Hilang", href: "/pos-inventory/losses", icon: AlertTriangle, group: "Inventory" },
  { title: "Stock Opname", href: "/pos-inventory/opname", icon: ClipboardCheck, group: "Inventory" },
  { title: "Riwayat Pergerakan Stok", href: "/pos-inventory/mutations", icon: Activity, group: "Inventory" },
  { title: "Cabang", href: "/pos-inventory/branches", icon: GitBranch, group: "Inventory" },

  // ── Sales ──
  { title: "Sales Dashboard", href: "/sales", icon: LayoutDashboard, group: "Sales" },
  { title: "Sales Items (Master)", href: "/sales/items", icon: Boxes, group: "Sales" },
  { title: "Quotations", href: "/sales/quotations", icon: FileText, group: "Sales" },
  { title: "Sales Orders", href: "/sales/orders", icon: ShoppingBag, group: "Sales" },
  { title: "AI Draft Quotation", href: "/sales/ai-drafts", icon: Bot, group: "Sales" },
  { title: "Customers", href: "/sales/customers", icon: UserCircle, group: "Sales" },
  { title: "Invoices (AR)", href: "/sales/invoices", icon: Receipt, group: "Sales" },

  // ── Purchase ──
  { title: "Purchase Dashboard", href: "/purchase", icon: LayoutDashboard, group: "Purchase" },
  { title: "Purchase Request (PR)", href: "/purchase/pr", icon: ClipboardList, group: "Purchase" },
  { title: "RFQ / Purchase RFQ", href: "/purchase/rfq", icon: FileText, group: "Purchase" },
  { title: "Purchase Orders (PO)", href: "/purchase/orders", icon: ShoppingBag, group: "Purchase" },
  { title: "Terima Barang (GRN)", href: "/purchase/gr", icon: PackageCheck, group: "Purchase" },
  { title: "QC Inspection", href: "/purchase/qc", icon: ClipboardCheck, group: "Purchase" },
  { title: "Purchase Return", href: "/purchase/returns", icon: RotateCcw, group: "Purchase" },
  { title: "Vendor Invoice (AP)", href: "/purchase/vendor-invoices", icon: Receipt, group: "Purchase" },
  { title: "Payment Request", href: "/purchase/payment-requests", icon: Wallet, group: "Purchase" },
  { title: "Landed Cost", href: "/purchase/landed-costs", icon: Calculator, group: "Purchase" },
  { title: "Vendors", href: "/purchase/vendors", icon: UserCircle, group: "Purchase" },

  // ── Accounting ──
  { title: "Chart of Accounts", href: "/accounting/accounts", icon: Landmark, group: "Accounting" },
  { title: "Jurnal (Journals)", href: "/accounting/journals", icon: BookOpen, group: "Accounting" },
  { title: "Journal Entries", href: "/accounting/entries", icon: FileText, group: "Accounting" },
  { title: "Payments", href: "/accounting/payments", icon: Wallet, group: "Accounting" },
  { title: "Taxes", href: "/accounting/taxes", icon: Receipt, group: "Accounting" },
  { title: "Trial Balance", href: "/accounting/reports/trial-balance", icon: FileSpreadsheet, group: "Accounting" },
  { title: "General Ledger", href: "/accounting/reports/general-ledger", icon: BookOpen, group: "Accounting" },
  { title: "Profit & Loss", href: "/accounting/reports/profit-loss", icon: TrendingUp, group: "Accounting" },
  { title: "Balance Sheet", href: "/accounting/reports/balance-sheet", icon: Wallet, group: "Accounting" },
  { title: "Rekonsiliasi", href: "/accounting/reconciliation", icon: GitMerge, group: "Accounting" },
  { title: "Accounting Settings", href: "/accounting/settings", icon: Settings, group: "Accounting" },

  // ── Logistics ──
  { title: "Logistic Shipments", href: "/logistics", icon: Truck, group: "Logistics" },
  { title: "Freight Forwarding", href: "/logistics/freight", icon: Ship, group: "Logistics" },
  { title: "Quotation Reply WA", href: "/logistics/quotation-reply", icon: MessageCircle, group: "Logistics" },
  { title: "Performa Driver", href: "/logistics/driver-performance", icon: BarChart2, group: "Logistics" },
  { title: "Request Quote", href: "/logistics/quote-requests", icon: FileText, group: "Logistics" },
  { title: "Portal Orders", href: "/logistics/portal-orders", icon: ClipboardList, group: "Logistics" },

  // ── Expense ──
  { title: "Daftar Expense", href: "/expense", icon: Receipt, group: "Expense" },
  { title: "Kategori Expense", href: "/expense/categories", icon: Tags, group: "Expense" },
  { title: "Laporan Expense", href: "/expense/reports", icon: BarChart2, group: "Expense" },

  // ── Komunikasi ──
  { title: "Korespondensi", href: "/correspondences", icon: Mail, group: "Komunikasi" },
  { title: "Email Inbox", href: "/email-inbox", icon: MessageCircle, group: "Komunikasi" },

  // ── AI & Media ──
  { title: "AI Chatbot", href: "/settings/ai-chatbot", icon: Bot, group: "AI & Media" },
  { title: "AI Knowledge Base", href: "/settings/ai-chatbot/knowledge", icon: BookOpen, group: "AI & Media" },
  { title: "AI Scan Settings", href: "/settings/ai-scan", icon: ScanLine, group: "AI & Media" },
  { title: "Image Manager", href: "/media", icon: ImageIcon, group: "AI & Media" },

  // ── Laporan ──
  { title: "Laporan Penjualan B2B", href: "/reports/sales", icon: TrendingUp, group: "Laporan" },
  { title: "Laporan Pembelian", href: "/reports/purchase", icon: ShoppingBag, group: "Laporan" },
  { title: "Valuasi Persediaan", href: "/reports/inventory-valuation", icon: PackageSearch, group: "Laporan" },
  { title: "AR Aging", href: "/reports/ar-aging", icon: Receipt, group: "Laporan" },
  { title: "AP Aging", href: "/reports/ap-aging", icon: FileText, group: "Laporan" },
  { title: "Audit Log Keamanan", href: "/reports/audit-log", icon: Shield, group: "Laporan" },

  // ── User & Organisasi ──
  { title: "Pengguna", href: "/users", icon: UserCircle, group: "User & Organisasi" },
  { title: "Manajemen Role", href: "/settings/roles", icon: ShieldCheck, group: "User & Organisasi" },
  { title: "Aturan Approval", href: "/settings/approval-rules", icon: ClipboardCheck, group: "User & Organisasi" },
  { title: "Struktur Organisasi", href: "/org", icon: Network, group: "User & Organisasi" },

  // ── Holding ──
  { title: "Holding Companies", href: "/holding", icon: Building2, group: "Holding" },
  { title: "Holding Dashboard", href: "/holding/dashboard", icon: LayoutDashboard, group: "Holding" },
  { title: "Holding P&L Report", href: "/holding/pl-report", icon: TrendingUp, group: "Holding" },

  // ── Sport Center ──
  { title: "Sport Center Dashboard", href: "/sport-center", icon: Dumbbell, group: "Sport Center" },
  { title: "Sport Center Booking", href: "/sport-center/bookings", icon: Calendar, group: "Sport Center" },
  { title: "Sport Center Jadwal", href: "/sport-center/schedule", icon: CalendarDays, group: "Sport Center" },
  { title: "Sport Center Produk & Layanan", href: "/sport-center/services", icon: Package, group: "Sport Center" },
  { title: "Sport Center Laporan", href: "/sport-center/reports", icon: BarChart2, group: "Sport Center" },

  // ── Lainnya ──
  { title: "Trading", href: "/trading", icon: Package, group: "Lainnya" },
  { title: "Katalog Terpadu", href: "/katalog-terpadu", icon: Layers, group: "Lainnya" },
  { title: "Portal Product Orders", href: "/portal-product-orders", icon: ShoppingBag, group: "Lainnya" },
];

const STORAGE_KEY = "bizportal:recent-pages";
const MAX_RECENT = 8;

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeRecent(hrefs: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hrefs));
  } catch {
    // ignore
  }
}

function pushRecent(href: string): string[] {
  const known = new Set(COMMANDS.map((c) => c.href));
  if (!known.has(href)) return readRecent();
  const prev = readRecent().filter((h) => h !== href);
  const next = [href, ...prev].slice(0, MAX_RECENT);
  writeRecent(next);
  return next;
}

export function usePageTracker() {
  const [location] = useLocation();
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    if (location !== prevRef.current) {
      prevRef.current = location;
      pushRecent(location);
    }
  }, [location]);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [recentHrefs, setRecentHrefs] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setRecentHrefs(readRecent());
    }
  }, [open]);

  const handleSelect = useCallback(
    (href: string) => {
      navigate(href);
      onOpenChange(false);
    },
    [navigate, onOpenChange],
  );

  const removeRecent = useCallback((href: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = readRecent().filter((h) => h !== href);
    writeRecent(updated);
    setRecentHrefs(updated);
  }, []);

  const recentCommands = recentHrefs
    .map((href) => COMMANDS.find((c) => c.href === href))
    .filter((c): c is CommandEntry => c !== undefined);

  const showRecent = search.trim() === "" && recentCommands.length > 0;
  const groups = Array.from(new Set(COMMANDS.map((c) => c.group)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-xl overflow-hidden gap-0" aria-describedby={undefined}>
        <Command className="rounded-lg border-0" shouldFilter={search.trim() !== ""}>
          <CommandInput
            placeholder="Cari halaman..."
            autoFocus
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[460px]">
            <CommandEmpty>Halaman tidak ditemukan.</CommandEmpty>

            {showRecent && (
              <>
                <CommandGroup heading="Terakhir Dikunjungi">
                  {recentCommands.map((c) => (
                    <CommandItem
                      key={`recent-${c.href}`}
                      value={`recent ${c.title} ${c.group}`}
                      onSelect={() => handleSelect(c.href)}
                      className="flex items-center gap-2 cursor-pointer group"
                    >
                      <Clock size={13} className="shrink-0 text-muted-foreground/70" />
                      <c.icon size={14} className="shrink-0 text-muted-foreground" />
                      <span>{c.title}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground/50 hidden sm:block pr-1">
                        {c.group}
                      </span>
                      <button
                        onClick={(e) => removeRecent(c.href, e)}
                        className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                        aria-label="Hapus dari riwayat"
                      >
                        <X size={11} />
                      </button>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {groups.map((group, gi) => (
              <span key={group}>
                {gi > 0 && <CommandSeparator />}
                <CommandGroup heading={group}>
                  {COMMANDS.filter((c) => c.group === group).map((c) => (
                    <CommandItem
                      key={c.href}
                      value={`${c.title} ${c.group}`}
                      onSelect={() => handleSelect(c.href)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <c.icon size={15} className="shrink-0 text-muted-foreground" />
                      <span>{c.title}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground/60 hidden sm:block">
                        {c.href}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </span>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}
