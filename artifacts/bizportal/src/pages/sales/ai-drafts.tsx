import { useState } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useListAiDraftQuotations,
  useForwardSalesDocumentToVendors,
  useListEligibleVendorsForDoc,
  useSalesDocumentAction,
  getListAiDraftQuotationsQueryKey,
  getListEligibleVendorsForDocQueryKey,
  getListSalesDocumentsQueryKey,
  type SalesDocument,
  type ForwardToVendorsBodyChannelsItem,
  type VendorSendResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Bot, ExternalLink, SendHorizonal, Trash2, RefreshCw, MessageSquare, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function SourceBadge({ doc }: { doc: SalesDocument }) {
  if (doc.aiSourceWaPhone)
    return (
      <Badge variant="outline" className="text-green-400 border-green-700">
        WhatsApp
      </Badge>
    );
  if (doc.aiSourceCorrespondenceId)
    return (
      <Badge variant="outline" className="text-blue-400 border-blue-700">
        Email
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-slate-400 border-slate-600">
      AI
    </Badge>
  );
}

export default function AiDraftsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: drafts = [], isLoading, refetch } = useListAiDraftQuotations();
  const forwardMut = useForwardSalesDocumentToVendors();
  const actionMut = useSalesDocumentAction();

  const [forwardDoc, setForwardDoc] = useState<SalesDocument | null>(null);
  const [discardDoc, setDiscardDoc] = useState<SalesDocument | null>(null);
  const [forwardResults, setForwardResults] = useState<VendorSendResult[] | null>(null);

  const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["wa", "email"]);

  const { data: eligibleVendors = [] } = useListEligibleVendorsForDoc(
    forwardDoc?.id ?? 0,
    { query: { enabled: !!forwardDoc, queryKey: getListEligibleVendorsForDocQueryKey(forwardDoc?.id ?? 0) } },
  );

  function handleForward(doc: SalesDocument) {
    setSelectedVendorIds([]);
    setSelectedChannels(["wa", "email"]);
    setForwardResults(null);
    setForwardDoc(doc);
  }

  function handleDiscard(doc: SalesDocument) {
    setDiscardDoc(doc);
  }

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  function toggleVendor(id: number) {
    setSelectedVendorIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  }

  async function confirmForward() {
    if (!forwardDoc) return;
    forwardMut.mutate(
      {
        id: forwardDoc.id,
        data: {
          vendorIds: selectedVendorIds.length > 0 ? selectedVendorIds : undefined,
          channels: selectedChannels.length > 0 ? (selectedChannels as ForwardToVendorsBodyChannelsItem[]) : undefined,
        },
      },
      {
        onSuccess: (data) => {
          setForwardResults(data.results ?? []);
          queryClient.invalidateQueries({ queryKey: getListAiDraftQuotationsQueryKey() });
          toast({
            title: "Diteruskan ke vendor",
            description: `${data.waCount} WA + ${data.emailCount} email ke ${data.vendorCount} vendor.`,
          });
        },
        onError: () => {
          toast({ title: "Gagal", description: "Tidak dapat meneruskan ke vendor.", variant: "destructive" });
        },
      },
    );
  }

  async function confirmDiscard() {
    if (!discardDoc) return;
    actionMut.mutate(
      { id: discardDoc.id, data: { action: "cancel" } },
      {
        onSuccess: () => {
          toast({ title: "Draft dibatalkan", description: discardDoc.docNumber });
          setDiscardDoc(null);
          queryClient.invalidateQueries({ queryKey: getListAiDraftQuotationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListSalesDocumentsQueryKey() });
        },
        onError: () => {
          toast({ title: "Gagal", description: "Tidak dapat membatalkan draft.", variant: "destructive" });
        },
      },
    );
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600">
              <Bot size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">AI Draft Quotations</h1>
              <p className="text-sm text-muted-foreground">
                Draft penawaran yang dibuat otomatis dari email & WhatsApp masuk
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw size={14} className="mr-2" />
            Refresh
          </Button>
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              Draft Menunggu Review
              {drafts.length > 0 && (
                <Badge className="bg-purple-600 text-white">{drafts.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Memuat...</div>
            ) : drafts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bot size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">Belum ada AI draft</p>
                <p className="text-xs mt-1">
                  Draft akan muncul otomatis saat ada email/WA berisi inquiry order
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Draft</TableHead>
                    <TableHead>Sumber</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Rute</TableHead>
                    <TableHead>Moda</TableHead>
                    <TableHead className="text-right">Total Est.</TableHead>
                    <TableHead>Masuk</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <Link
                          href={`/sales/quotations/${doc.id}`}
                          className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          {doc.docNumber}
                          <ExternalLink size={10} />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <SourceBadge doc={doc} />
                      </TableCell>
                      <TableCell className="font-medium">{doc.customerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[doc.origin, doc.destination].filter(Boolean).join(" → ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm capitalize text-muted-foreground">
                        {doc.transportMode ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {idr(doc.grandTotal)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(doc.createdAt).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={() => handleForward(doc)}
                            disabled={forwardMut.isPending}
                          >
                            <SendHorizonal size={13} className="mr-1" />
                            Forward ke Vendor
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive hover:bg-destructive hover:text-white"
                            onClick={() => handleDiscard(doc)}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Forward Confirmation Dialog */}
        <Dialog open={!!forwardDoc} onOpenChange={(o) => !o && setForwardDoc(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-purple-400" />
                Forward ke Vendor
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1 text-sm">
              {forwardResults ? (
                <div className="space-y-2">
                  <p className="font-medium text-green-400">✓ Selesai dikirim</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {forwardResults.map((r) => (
                      <div key={r.vendorId} className="flex items-center justify-between rounded border border-border px-3 py-1.5 bg-muted/20">
                        <span className="font-medium flex-1">{r.vendorName}</span>
                        <div className="flex gap-2 text-xs">
                          {r.waStatus && (
                            <span className={r.waStatus === "sent" ? "text-green-400" : r.waStatus === "failed" ? "text-red-400" : "text-muted-foreground"}>
                              WA: {r.waStatus}
                            </span>
                          )}
                          {r.emailStatus && (
                            <span className={r.emailStatus === "sent" ? "text-green-400" : r.emailStatus === "failed" ? "text-red-400" : "text-muted-foreground"}>
                              Email: {r.emailStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
              {forwardDoc && (
                <div className="rounded-md border border-border p-3 space-y-1 bg-muted/30">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dokumen</span>
                    <span className="font-medium">{forwardDoc.docNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer</span>
                    <span className="font-medium">{forwardDoc.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rute</span>
                    <span>{[forwardDoc.origin, forwardDoc.destination].filter(Boolean).join(" → ") || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Moda</span>
                    <span className="capitalize">{forwardDoc.transportMode ?? "—"}</span>
                  </div>
                </div>
              )}

              <div>
                <p className="font-medium mb-2">Channel Pengiriman</p>
                <div className="flex gap-4">
                  {[
                    { id: "wa", label: "WhatsApp", icon: <MessageSquare size={14} /> },
                    { id: "email", label: "Email", icon: <Mail size={14} /> },
                  ].map((ch) => (
                    <label key={ch.id} className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={selectedChannels.includes(ch.id)}
                        onCheckedChange={() => toggleChannel(ch.id)}
                      />
                      {ch.icon}
                      {ch.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-medium mb-2">
                  Vendor {eligibleVendors.length > 0 ? `(${eligibleVendors.length} eligible)` : ""}
                </p>
                {eligibleVendors.length === 0 ? (
                  <p className="text-muted-foreground text-xs">Tidak ada vendor eligible — semua vendor aktif akan digunakan.</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground mb-1">
                      <Checkbox
                        checked={selectedVendorIds.length === 0}
                        onCheckedChange={() => setSelectedVendorIds([])}
                      />
                      <span>Semua vendor</span>
                    </label>
                    {eligibleVendors.map((v) => (
                      <label key={v.id} className="flex items-center gap-2 cursor-pointer select-none">
                        <Checkbox
                          checked={selectedVendorIds.includes(v.id)}
                          onCheckedChange={() => toggleVendor(v.id)}
                        />
                        <span className="flex-1">{v.name}</span>
                        <span className="text-muted-foreground text-xs flex gap-1">
                          {v.hasPhone && <MessageSquare size={11} />}
                          {v.hasEmail && <Mail size={11} />}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
              )}
            </div>
            <DialogFooter>
              {forwardResults ? (
                <Button variant="outline" onClick={() => { setForwardDoc(null); setForwardResults(null); }}>Tutup</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setForwardDoc(null)}>Batal</Button>
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={confirmForward}
                    disabled={forwardMut.isPending || selectedChannels.length === 0}
                  >
                    {forwardMut.isPending ? "Mengirim..." : "Forward ke Vendor"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Discard Confirmation Dialog */}
        <Dialog open={!!discardDoc} onOpenChange={(o) => !o && setDiscardDoc(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Batalkan Draft</DialogTitle>
            </DialogHeader>
            <p className="text-sm py-2">
              Draft <strong>{discardDoc?.docNumber}</strong> akan dibatalkan. Tindakan ini
              tidak dapat dibatalkan.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDiscardDoc(null)}>
                Kembali
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDiscard}
                disabled={actionMut.isPending}
              >
                {actionMut.isPending ? "Membatalkan..." : "Batalkan Draft"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
