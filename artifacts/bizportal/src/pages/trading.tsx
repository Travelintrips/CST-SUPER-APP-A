import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Building, PackageOpen } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  useListStocks,
  useListSuppliers,
  useCreateStockItem,
  useCreateSupplier,
  getListStocksQueryKey,
  getListSuppliersQueryKey,
} from "@workspace/api-client-react";

export default function TradingPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: stocks, isLoading: isLoadingStocks } = useListStocks();
  const { data: suppliers, isLoading: isLoadingSuppliers } = useListSuppliers();

  const createStock = useCreateStockItem();
  const createSupplier = useCreateSupplier();

  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);

  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);
  };

  const handleCreateStock = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    createStock.mutate({
      productName: formData.get("productName") as string,
      sku: formData.get("sku") as string,
      quantity: Number(formData.get("quantity")),
      unit: formData.get("unit") as string,
      costPrice: Number(formData.get("costPrice")),
      hsCode: formData.get("hsCode") as string,
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStocksQueryKey() });
        setIsStockDialogOpen(false);
        toast({ title: "Stock item berhasil ditambahkan" });
      },
      onError: () => toast({ title: "Failed to add stock item", variant: "destructive" })
    });
  };

  const handleCreateSupplier = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    createSupplier.mutate({
      name: formData.get("name") as string,
      country: formData.get("country") as string,
      contactEmail: formData.get("contactEmail") as string,
      phone: formData.get("phone") as string,
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        setIsSupplierDialogOpen(false);
        toast({ title: "Supplier berhasil ditambahkan" });
      },
      onError: () => toast({ title: "Failed to add supplier", variant: "destructive" })
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trading & B2B</h1>
          <p className="text-muted-foreground mt-2">Manage bulk inventory, suppliers, and international trade items.</p>
        </div>

        <Tabs defaultValue="inventory" className="space-y-4">
          <TabsList>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>
          
          <TabsContent value="inventory" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold tracking-tight">Stock Inventory</h2>
              <Dialog open={isStockDialogOpen} onOpenChange={setIsStockDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" /> Add Stock Item</Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreateStock}>
                    <DialogHeader>
                      <DialogTitle>Add Inventory Item</DialogTitle>
                      <DialogDescription>Record new bulk stock into the warehouse.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="productName">Product Name</Label>
                        <Input id="productName" name="productName" required />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="sku">SKU</Label>
                          <Input id="sku" name="sku" required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="hsCode">HS Code</Label>
                          <Input id="hsCode" name="hsCode" placeholder="Optional" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="quantity">Quantity</Label>
                          <Input id="quantity" name="quantity" type="number" min="0" required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="unit">Unit (e.g. Pallet, Box)</Label>
                          <Input id="unit" name="unit" required />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="costPrice">Cost Price (IDR)</Label>
                        <Input id="costPrice" name="costPrice" type="number" min="0" required />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createStock.isPending}>
                        {createStock.isPending ? "Adding..." : "Add Stock Item"}
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
                      <TableHead>Product / SKU</TableHead>
                      <TableHead>HS Code</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Cost Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingStocks ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-[100px] ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : stocks?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <PackageOpen className="h-8 w-8 mb-2 opacity-50" />
                            <p>No stock inventory found.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      stocks?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.productName}</div>
                            <div className="text-xs text-muted-foreground">{item.sku}</div>
                          </TableCell>
                          <TableCell>{item.hsCode || '-'}</TableCell>
                          <TableCell>{item.supplierName || 'Unknown'}</TableCell>
                          <TableCell className="text-right font-medium">{item.quantity} {item.unit}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatIDR(item.costPrice)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="suppliers" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold tracking-tight">Suppliers Directory</h2>
              <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" /> Add Supplier</Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreateSupplier}>
                    <DialogHeader>
                      <DialogTitle>Register Supplier</DialogTitle>
                      <DialogDescription>Add a new vendor or partner to your directory.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Company Name</Label>
                        <Input id="name" name="name" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="country">Country</Label>
                        <Input id="country" name="country" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="contactEmail">Contact Email</Label>
                        <Input id="contactEmail" name="contactEmail" type="email" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input id="phone" name="phone" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createSupplier.isPending}>
                        {createSupplier.isPending ? "Saving..." : "Save Supplier"}
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
                      <TableHead>Company Name</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Contact Email</TableHead>
                      <TableHead>Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingSuppliers ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                        </TableRow>
                      ))
                    ) : suppliers?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Building className="h-8 w-8 mb-2 opacity-50" />
                            <p>No suppliers registered yet.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      suppliers?.map((supplier) => (
                        <TableRow key={supplier.id}>
                          <TableCell className="font-medium">{supplier.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{supplier.country}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{supplier.contactEmail}</TableCell>
                          <TableCell>{supplier.phone || '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
