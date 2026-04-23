import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Receipt, Banknote, CreditCard, Wallet, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useGetPosSummary,
  useListTransactions,
  useCreateTransaction,
  getGetPosSummaryQueryKey,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";

export default function PosPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: summary, isLoading: isLoadingSummary } = useGetPosSummary();
  const { data: transactions, isLoading: isLoadingTx } = useListTransactions();
  const createTransaction = useCreateTransaction();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);
  };

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'cash': return <Banknote className="h-3 w-3 mr-1" />;
      case 'debit': return <CreditCard className="h-3 w-3 mr-1" />;
      case 'credit': return <CreditCard className="h-3 w-3 mr-1" />;
      case 'qris': return <QrCode className="h-3 w-3 mr-1" />;
      case 'transfer': return <Wallet className="h-3 w-3 mr-1" />;
      default: return null;
    }
  };

  const handleCreateTransaction = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const qty = Number(formData.get("quantity"));
    const price = Number(formData.get("unitPrice"));

    createTransaction.mutate({
      productName: formData.get("productName") as string,
      quantity: qty,
      unitPrice: price,
      totalPrice: qty * price,
      paymentMethod: paymentMethod as "cash" | "debit" | "credit" | "qris" | "transfer",
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPosSummaryQueryKey() });
        setIsDialogOpen(false);
        toast({ title: "Transaction recorded successfully" });
      },
      onError: () => toast({ title: "Failed to record transaction", variant: "destructive" })
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Point of Sale</h1>
          <p className="text-muted-foreground mt-2">Manage daily physical store transactions and retail summaries.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Total</CardTitle>
              <Banknote className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? <Skeleton className="h-7 w-[120px] bg-muted" /> : (
                <div className="text-2xl font-bold">{formatIDR(summary?.todayTotal || 0)}</div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Tx</CardTitle>
              <Receipt className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? <Skeleton className="h-7 w-[40px] bg-muted" /> : (
                <div className="text-2xl font-bold">{summary?.todayCount || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Month Total</CardTitle>
              <Wallet className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? <Skeleton className="h-7 w-[120px] bg-muted" /> : (
                <div className="text-xl font-bold">{formatIDR(summary?.monthTotal || 0)}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Month Tx</CardTitle>
              <Receipt className="h-4 w-4 text-violet-500" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? <Skeleton className="h-7 w-[40px] bg-muted" /> : (
                <div className="text-xl font-bold">{summary?.monthCount || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center mt-8">
          <h2 className="text-xl font-semibold tracking-tight">Recent Transactions</h2>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="mr-2 h-5 w-5" /> New Sale
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateTransaction}>
                <DialogHeader>
                  <DialogTitle>Record New Sale</DialogTitle>
                  <DialogDescription>Enter the details for an immediate POS transaction.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="productName">Product Name</Label>
                    <Input id="productName" name="productName" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input id="quantity" name="quantity" type="number" min="1" defaultValue="1" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="unitPrice">Unit Price (IDR)</Label>
                      <Input id="unitPrice" name="unitPrice" type="number" min="0" required />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="debit">Debit Card</SelectItem>
                        <SelectItem value="credit">Credit Card</SelectItem>
                        <SelectItem value="qris">QRIS</SelectItem>
                        <SelectItem value="transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" className="w-full" disabled={createTransaction.isPending}>
                    {createTransaction.isPending ? "Processing..." : "Complete Checkout"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingTx ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-[20px] ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-6 w-[80px] rounded-full ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : transactions?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Receipt className="h-8 w-8 mb-2 opacity-50" />
                        <p>No transactions yet today.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions?.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="font-medium">{tx.productName}</TableCell>
                      <TableCell className="text-right">{tx.quantity}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatIDR(tx.unitPrice)}</TableCell>
                      <TableCell className="text-right font-bold">{formatIDR(tx.totalPrice)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="uppercase font-normal">
                          {getPaymentIcon(tx.paymentMethod)}
                          {tx.paymentMethod}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
