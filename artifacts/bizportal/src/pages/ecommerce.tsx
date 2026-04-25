import { AppShell } from "@/components/layout/AppShell";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useListOrders,
  useCreateOrder,
  useUpdateOrder,
  useDeleteOrder,
  useListTaxes,
  useGetAccountingSettings,
  getListProductsQueryKey,
  getListOrdersQueryKey,
  type Product,
  type Order,
  type AccountingTax,
} from "@workspace/api-client-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, PackageSearch, ShoppingBag, Pencil, Trash2, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@workspace/object-storage-web";
import { ImagePlus, ImageIcon, Loader2 } from "lucide-react";

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
type OrderStatus = typeof ORDER_STATUSES[number];

export default function EcommercePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const search = useSearch();
  const [, setLocation] = useLocation();

  const initialTab = (() => {
    const params = new URLSearchParams(search);
    const t = params.get("tab");
    return t === "orders" ? "orders" : "products";
  })();
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  useEffect(() => {
    const params = new URLSearchParams(search);
    const t = params.get("tab");
    const next = t === "orders" || t === "products" ? t : "products";
    setActiveTab((prev) => (prev !== next ? next : prev));
  }, [search]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(search);
    if (value === "orders") params.set("tab", "orders");
    else params.delete("tab");
    const qs = params.toString();
    setLocation(qs ? `/ecommerce?${qs}` : `/ecommerce`, { replace: true });
  };

  const { data: products, isLoading: isLoadingProducts } = useListProducts({
    query: { queryKey: getListProductsQueryKey() }
  });

  const { data: orders, isLoading: isLoadingOrders } = useListOrders({
    query: { queryKey: getListOrdersQueryKey() }
  });

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const deleteOrder = useDeleteOrder();

  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editOrderStatus, setEditOrderStatus] = useState<OrderStatus>("pending");
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [createImageUrl, setCreateImageUrl] = useState<string | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);

  const [createSubtotal, setCreateSubtotal] = useState(0);
  const [createTaxRateId, setCreateTaxRateId] = useState<string>("");
  const [createTaxAmount, setCreateTaxAmount] = useState(0);

  const [editSubtotal, setEditSubtotal] = useState(0);
  const [editTaxRateId, setEditTaxRateId] = useState<string>("");
  const [editTaxAmount, setEditTaxAmount] = useState(0);

  const { data: allTaxes = [] as AccountingTax[] } = useListTaxes();
  const { data: accountingSettings } = useGetAccountingSettings();
  const saleTaxes = allTaxes.filter((t) => t.kind === "sale" && t.isActive);
  const purchaseTaxes = allTaxes.filter((t) => t.kind === "purchase" && t.isActive);

  const [createProdSalesTaxId, setCreateProdSalesTaxId] = useState<number | null>(null);
  const [createProdPurchaseTaxId, setCreateProdPurchaseTaxId] = useState<number | null>(null);
  const [editProdSalesTaxId, setEditProdSalesTaxId] = useState<number | null>(null);
  const [editProdPurchaseTaxId, setEditProdPurchaseTaxId] = useState<number | null>(null);

  const defaultSalesTaxIdRef = useRef<number | null | undefined>(undefined);
  defaultSalesTaxIdRef.current = accountingSettings?.defaultSalesTaxId;

  const createImageUploader = useUpload({
    onSuccess: (res) => {
      setCreateImageUrl(res.objectPath);
      toast({ title: "Gambar berhasil diunggah" });
    },
    onError: () => toast({ title: "Gagal mengunggah gambar", variant: "destructive" }),
  });
  const editImageUploader = useUpload({
    onSuccess: (res) => {
      setEditImageUrl(res.objectPath);
      toast({ title: "Gambar berhasil diunggah" });
    },
    onError: () => toast({ title: "Gagal mengunggah gambar", variant: "destructive" }),
  });

  const resolveImage = (url?: string | null) => {
    if (!url) return null;
    if (url.startsWith("/objects/")) return `/api/storage${url}`;
    if (url.startsWith("/api/")) return url;
    return url;
  };

  const formatIDR = (value: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  const getOrderStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20';
      case 'processing': return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20';
      case 'shipped': return 'bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 border-indigo-500/20';
      case 'delivered': return 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20';
      case 'cancelled': return 'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const handleCreateProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createProduct.mutate({
      data: {
        name: formData.get("name") as string,
        sku: formData.get("sku") as string,
        price: Number(formData.get("price")),
        stock: Number(formData.get("stock")),
        category: formData.get("category") as string,
        imageUrl: createImageUrl,
        defaultSalesTaxId: createProdSalesTaxId,
        defaultPurchaseTaxId: createProdPurchaseTaxId,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setIsProductDialogOpen(false);
        setCreateImageUrl(null);
        setCreateProdSalesTaxId(null);
        setCreateProdPurchaseTaxId(null);
        toast({ title: "Produk berhasil dibuat" });
      },
      onError: () => toast({ title: "Gagal membuat produk", variant: "destructive" }),
    });
  };

  const handleEditProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProduct) return;
    const formData = new FormData(e.currentTarget);
    updateProduct.mutate({
      id: editingProduct.id,
      data: {
        name: formData.get("name") as string,
        sku: formData.get("sku") as string,
        price: Number(formData.get("price")),
        stock: Number(formData.get("stock")),
        category: formData.get("category") as string,
        imageUrl: editImageUrl,
        defaultSalesTaxId: editProdSalesTaxId,
        defaultPurchaseTaxId: editProdPurchaseTaxId,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setEditingProduct(null);
        toast({ title: "Produk berhasil diperbarui" });
      },
      onError: () => toast({ title: "Gagal memperbarui produk", variant: "destructive" }),
    });
  };

  useEffect(() => {
    if (!isProductDialogOpen) setCreateImageUrl(null);
  }, [isProductDialogOpen]);

  useEffect(() => {
    setEditImageUrl(editingProduct?.imageUrl ?? null);
    setEditProdSalesTaxId(editingProduct?.defaultSalesTaxId ?? null);
    setEditProdPurchaseTaxId(editingProduct?.defaultPurchaseTaxId ?? null);
  }, [editingProduct]);

  const handleConfirmDeleteProduct = () => {
    if (!deletingProduct) return;
    const id = deletingProduct.id;
    deleteProduct.mutate({ id }, {
      onSuccess: () => {
        queryClient.setQueryData<Product[]>(getListProductsQueryKey(), (old) => old?.filter(p => p.id !== id) ?? []);
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setDeletingProduct(null);
        toast({ title: "Produk berhasil dihapus" });
      },
      onError: () => toast({ title: "Gagal menghapus produk", variant: "destructive" }),
    });
  };

  const computeTax = (subtotal: number, taxRateId: string): number => {
    if (!taxRateId) return 0;
    const tax = saleTaxes.find((t) => String(t.id) === taxRateId);
    if (!tax) return 0;
    return Math.round((subtotal * Number(tax.rate)) / 100);
  };

  const handleCreateTaxRateChange = (val: string, subtotal: number) => {
    const rateId = val === "none" ? "" : val;
    setCreateTaxRateId(rateId);
    setCreateTaxAmount(rateId ? computeTax(subtotal, rateId) : 0);
  };

  const handleEditTaxRateChange = (val: string, subtotal: number) => {
    const rateId = val === "none" ? "" : val;
    setEditTaxRateId(rateId);
    setEditTaxAmount(rateId ? computeTax(subtotal, rateId) : 0);
  };

  const handleCreateOrder = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createOrder.mutate({
      data: {
        customerName: formData.get("customerName") as string,
        customerEmail: formData.get("customerEmail") as string,
        items: formData.get("items") as string,
        totalAmount: createSubtotal,
        taxAmount: createTaxAmount,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        setIsOrderDialogOpen(false);
        toast({ title: "Order berhasil dibuat" });
      },
      onError: () => toast({ title: "Gagal membuat order", variant: "destructive" }),
    });
  };

  const handleEditOrder = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingOrder) return;
    const formData = new FormData(e.currentTarget);
    updateOrder.mutate({
      id: editingOrder.id,
      data: {
        customerName: formData.get("customerName") as string,
        customerEmail: formData.get("customerEmail") as string,
        items: formData.get("items") as string,
        totalAmount: editSubtotal,
        taxAmount: editTaxAmount,
        status: editOrderStatus,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        setEditingOrder(null);
        toast({ title: "Order berhasil diperbarui" });
      },
      onError: () => toast({ title: "Gagal memperbarui order", variant: "destructive" }),
    });
  };

  const handleConfirmDeleteOrder = () => {
    if (!deletingOrder) return;
    const id = deletingOrder.id;
    deleteOrder.mutate({ id }, {
      onSuccess: () => {
        queryClient.setQueryData<Order[]>(getListOrdersQueryKey(), (old) => old?.filter(o => o.id !== id) ?? []);
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        setDeletingOrder(null);
        toast({ title: "Order berhasil dihapus" });
      },
      onError: () => toast({ title: "Gagal menghapus order", variant: "destructive" }),
    });
  };

  useEffect(() => {
    if (!isOrderDialogOpen) {
      setCreateSubtotal(0);
      setCreateTaxRateId("");
      setCreateTaxAmount(0);
    } else {
      const defaultId = defaultSalesTaxIdRef.current;
      const validDefault = defaultId && saleTaxes.some((t) => t.id === defaultId);
      setCreateTaxRateId(validDefault ? String(defaultId) : "");
      setCreateSubtotal(0);
      setCreateTaxAmount(0);
    }
  }, [isOrderDialogOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEditOrder = (order: Order) => {
    setEditingOrder(order);
    setEditOrderStatus((order.status as OrderStatus) ?? "pending");
    setEditSubtotal(order.totalAmount);
    setEditTaxRateId("");
    setEditTaxAmount(order.taxAmount ?? 0);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">E-Commerce</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Kelola katalog toko online dan pesanan pelanggan.</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="products" className="flex-1 sm:flex-none" data-testid="tab-products">Produk</TabsTrigger>
            <TabsTrigger value="orders" className="flex-1 sm:flex-none" data-testid="tab-orders">Order</TabsTrigger>
          </TabsList>

          {/* PRODUCTS TAB */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight">Katalog Produk</h2>
              <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-product"><Plus className="mr-2 h-4 w-4" /> Tambah Produk</Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreateProduct}>
                    <DialogHeader>
                      <DialogTitle>Tambah Produk Baru</DialogTitle>
                      <DialogDescription>Buat produk baru di katalog Anda.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2"><Label htmlFor="name">Nama Produk</Label><Input id="name" name="name" required data-testid="input-product-name" /></div>
                      <div className="grid gap-2"><Label htmlFor="sku">SKU</Label><Input id="sku" name="sku" required data-testid="input-product-sku" /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2"><Label htmlFor="price">Harga (IDR)</Label><Input id="price" name="price" type="number" min="0" required data-testid="input-product-price" /></div>
                        <div className="grid gap-2"><Label htmlFor="stock">Stok</Label><Input id="stock" name="stock" type="number" min="0" required data-testid="input-product-stock" /></div>
                      </div>
                      <div className="grid gap-2"><Label htmlFor="category">Kategori</Label><Input id="category" name="category" required data-testid="input-product-category" /></div>
                      <ProductImageField
                        imageUrl={createImageUrl}
                        isUploading={createImageUploader.isUploading}
                        onPickFile={(file) => createImageUploader.uploadFile(file)}
                        onRemove={() => setCreateImageUrl(null)}
                        resolveImage={resolveImage}
                        idPrefix="create"
                      />
                      <div className="grid gap-2">
                        <Label>Tarif Pajak Penjualan Default</Label>
                        <Select value={createProdSalesTaxId ? String(createProdSalesTaxId) : "none"} onValueChange={(v) => setCreateProdSalesTaxId(v === "none" ? null : parseInt(v))} data-testid="select-create-product-sales-tax">
                          <SelectTrigger><SelectValue placeholder="Tidak ada pajak default" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Tidak ada pajak default</SelectItem>
                            {saleTaxes.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Tarif Pajak Pembelian Default</Label>
                        <Select value={createProdPurchaseTaxId ? String(createProdPurchaseTaxId) : "none"} onValueChange={(v) => setCreateProdPurchaseTaxId(v === "none" ? null : parseInt(v))} data-testid="select-create-product-purchase-tax">
                          <SelectTrigger><SelectValue placeholder="Tidak ada pajak default" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Tidak ada pajak default</SelectItem>
                            {purchaseTaxes.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createProduct.isPending || createImageUploader.isUploading} data-testid="button-submit-product">
                        {createProduct.isPending ? "Menyimpan..." : "Buat Produk"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[64px]">Foto</TableHead>
                      <TableHead>Nama Produk</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead className="text-right">Stok</TableHead>
                      <TableHead>Pajak Default (Jual)</TableHead>
                      <TableHead>Pajak Default (Beli)</TableHead>
                      <TableHead className="text-right w-[120px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingProducts ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-10 w-10 rounded-md" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-[80px] ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : products?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <PackageSearch className="h-8 w-8 mb-2 opacity-50" />
                            <p>Belum ada produk. Tambahkan produk pertama Anda.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      products?.map((product) => (
                        <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                          <TableCell>
                            <ProductThumb src={resolveImage(product.imageUrl)} alt={product.name} />
                          </TableCell>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>{product.sku}</TableCell>
                          <TableCell><Badge variant="outline">{product.category}</Badge></TableCell>
                          <TableCell className="text-right">{formatIDR(product.price)}</TableCell>
                          <TableCell className="text-right font-medium">
                            <span className={product.stock < 10 ? "text-destructive" : ""}>{product.stock}</span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {product.defaultSalesTaxId
                              ? (allTaxes.find((t) => t.id === product.defaultSalesTaxId)?.name ?? "—")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {product.defaultPurchaseTaxId
                              ? (allTaxes.find((t) => t.id === product.defaultPurchaseTaxId)?.name ?? "—")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => setEditingProduct(product)} data-testid={`button-edit-product-${product.id}`} aria-label="Edit produk">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeletingProduct(product)} data-testid={`button-delete-product-${product.id}`} aria-label="Hapus produk" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="md:hidden space-y-3">
              {isLoadingProducts ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-4 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </CardContent></Card>
                ))
              ) : products?.length === 0 ? (
                <Card><CardContent className="p-8 text-center">
                  <PackageSearch className="h-8 w-8 mb-2 opacity-50 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Belum ada produk. Tambahkan produk pertama Anda.</p>
                </CardContent></Card>
              ) : (
                products?.map((product) => (
                  <Card key={product.id} data-testid={`card-product-${product.id}`}><CardContent className="p-4 space-y-2">
                    <div className="flex items-start gap-3">
                      <ProductThumb src={resolveImage(product.imageUrl)} alt={product.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{product.sku}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">{product.category}</Badge>
                    </div>
                    <div className="flex justify-between items-end pt-1 border-t border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Harga</p>
                        <p className="text-sm font-medium">{formatIDR(product.price)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Stok</p>
                        <p className={`text-sm font-medium ${product.stock < 10 ? "text-destructive" : ""}`}>{product.stock}</p>
                      </div>
                    </div>
                    <div className="pt-1">
                      <p className="text-xs text-muted-foreground">Pajak Default (Jual)</p>
                      <p className="text-sm">
                        {product.defaultSalesTaxId
                          ? (allTaxes.find((t) => t.id === product.defaultSalesTaxId)?.name ?? "—")
                          : "—"}
                      </p>
                    </div>
                    <div className="pt-1">
                      <p className="text-xs text-muted-foreground">Pajak Default (Beli)</p>
                      <p className="text-sm">
                        {product.defaultPurchaseTaxId
                          ? (allTaxes.find((t) => t.id === product.defaultPurchaseTaxId)?.name ?? "—")
                          : "—"}
                      </p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingProduct(product)} data-testid={`button-edit-product-mobile-${product.id}`}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={() => setDeletingProduct(product)} data-testid={`button-delete-product-mobile-${product.id}`}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Hapus
                      </Button>
                    </div>
                  </CardContent></Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* ORDERS TAB */}
          <TabsContent value="orders" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight">Order Terbaru</h2>
              <Dialog open={isOrderDialogOpen} onOpenChange={setIsOrderDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-order"><Plus className="mr-2 h-4 w-4" /> Tambah Order</Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreateOrder}>
                    <DialogHeader>
                      <DialogTitle>Buat Order Manual</DialogTitle>
                      <DialogDescription>Masukkan order pelanggan secara manual.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2"><Label htmlFor="customerName">Nama Pelanggan</Label><Input id="customerName" name="customerName" required data-testid="input-order-customer-name" /></div>
                      <div className="grid gap-2"><Label htmlFor="customerEmail">Email Pelanggan</Label><Input id="customerEmail" name="customerEmail" type="email" required data-testid="input-order-customer-email" /></div>
                      <div className="grid gap-2"><Label htmlFor="items">Ringkasan Item</Label><Input id="items" name="items" placeholder="cth. 2x T-Shirt, 1x Sepatu" required data-testid="input-order-items" /></div>
                      <div className="grid gap-2">
                        <Label htmlFor="totalAmount">Subtotal (IDR)</Label>
                        <Input
                          id="totalAmount"
                          name="totalAmount"
                          type="number"
                          min="0"
                          required
                          value={createSubtotal || ""}
                          onChange={(e) => {
                            const sub = Number(e.target.value) || 0;
                            setCreateSubtotal(sub);
                            if (createTaxRateId) setCreateTaxAmount(computeTax(sub, createTaxRateId));
                          }}
                          data-testid="input-order-total"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="create-tax-rate">Tarif PPN</Label>
                          <Select value={createTaxRateId} onValueChange={(v) => handleCreateTaxRateChange(v === "none" ? "" : v, createSubtotal)} data-testid="select-create-tax-rate">
                            <SelectTrigger id="create-tax-rate" data-testid="select-trigger-create-tax-rate"><SelectValue placeholder="Tidak ada PPN" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Tidak ada PPN</SelectItem>
                              {saleTaxes.map((t) => (
                                <SelectItem key={t.id} value={String(t.id)}>{t.name} ({Number(t.rate).toFixed(0)}%)</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="create-tax-amount">PPN (IDR)</Label>
                          <Input
                            id="create-tax-amount"
                            type="number"
                            min="0"
                            value={createTaxAmount}
                            readOnly
                            className="bg-muted text-muted-foreground cursor-not-allowed"
                            data-testid="input-order-tax"
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createOrder.isPending} data-testid="button-submit-order">
                        {createOrder.isPending ? "Menyimpan..." : "Buat Order"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                      <TableHead className="text-right w-[120px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingOrders ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-[100px] ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-[80px] ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : orders?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <ShoppingBag className="h-8 w-8 mb-2 opacity-50" />
                            <p>Belum ada order.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders?.map((order) => (
                        <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                          <TableCell className="font-medium">#ORD-{order.id.toString().padStart(4, '0')}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{order.customerName}</span>
                              <span className="text-xs text-muted-foreground">{order.customerEmail}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`capitalize ${getOrderStatusColor(order.status)}`}>{order.status}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right font-medium">
                            <div>{formatIDR(order.grandTotal)}</div>
                            {order.taxAmount > 0 && (
                              <div className="text-xs text-muted-foreground">PPN: {formatIDR(order.taxAmount)}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => setPrintingOrder(order)} data-testid={`button-print-order-${order.id}`} aria-label="Cetak invoice">
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => openEditOrder(order)} data-testid={`button-edit-order-${order.id}`} aria-label="Edit order">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeletingOrder(order)} data-testid={`button-delete-order-${order.id}`} aria-label="Hapus order" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="md:hidden space-y-3">
              {isLoadingOrders ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-4 space-y-2">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent></Card>
                ))
              ) : orders?.length === 0 ? (
                <Card><CardContent className="p-8 text-center">
                  <ShoppingBag className="h-8 w-8 mb-2 opacity-50 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Belum ada order.</p>
                </CardContent></Card>
              ) : (
                orders?.map((order) => (
                  <Card key={order.id} data-testid={`card-order-${order.id}`}><CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium font-mono text-sm">#ORD-{order.id.toString().padStart(4, '0')}</p>
                      <Badge variant="outline" className={`capitalize shrink-0 ${getOrderStatusColor(order.status)}`}>{order.status}</Badge>
                    </div>
                    <div>
                      <p className="text-sm font-medium truncate">{order.customerName}</p>
                      <p className="text-xs text-muted-foreground truncate">{order.customerEmail}</p>
                    </div>
                    <div className="flex justify-between items-end pt-1 border-t border-border">
                      <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatIDR(order.grandTotal)}</p>
                        {order.taxAmount > 0 && (
                          <p className="text-xs text-muted-foreground">PPN: {formatIDR(order.taxAmount)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setPrintingOrder(order)} data-testid={`button-print-order-mobile-${order.id}`}>
                        <Printer className="h-3.5 w-3.5 mr-1.5" /> Cetak
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openEditOrder(order)} data-testid={`button-edit-order-mobile-${order.id}`}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={() => setDeletingOrder(order)} data-testid={`button-delete-order-mobile-${order.id}`}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Hapus
                      </Button>
                    </div>
                  </CardContent></Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* EDIT PRODUCT DIALOG */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent>
          {editingProduct && (
            <form onSubmit={handleEditProduct}>
              <DialogHeader>
                <DialogTitle>Edit Produk</DialogTitle>
                <DialogDescription>Perbarui detail produk.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2"><Label htmlFor="edit-name">Nama Produk</Label><Input id="edit-name" name="name" defaultValue={editingProduct.name} required data-testid="input-edit-product-name" /></div>
                <div className="grid gap-2"><Label htmlFor="edit-sku">SKU</Label><Input id="edit-sku" name="sku" defaultValue={editingProduct.sku} required data-testid="input-edit-product-sku" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2"><Label htmlFor="edit-price">Harga (IDR)</Label><Input id="edit-price" name="price" type="number" min="0" defaultValue={editingProduct.price} required data-testid="input-edit-product-price" /></div>
                  <div className="grid gap-2"><Label htmlFor="edit-stock">Stok</Label><Input id="edit-stock" name="stock" type="number" min="0" defaultValue={editingProduct.stock} required data-testid="input-edit-product-stock" /></div>
                </div>
                <div className="grid gap-2"><Label htmlFor="edit-category">Kategori</Label><Input id="edit-category" name="category" defaultValue={editingProduct.category} required data-testid="input-edit-product-category" /></div>
                <ProductImageField
                  imageUrl={editImageUrl}
                  isUploading={editImageUploader.isUploading}
                  onPickFile={(file) => editImageUploader.uploadFile(file)}
                  onRemove={() => setEditImageUrl(null)}
                  resolveImage={resolveImage}
                  idPrefix="edit"
                />
                <div className="grid gap-2">
                  <Label>Tarif Pajak Penjualan Default</Label>
                  <Select value={editProdSalesTaxId ? String(editProdSalesTaxId) : "none"} onValueChange={(v) => setEditProdSalesTaxId(v === "none" ? null : parseInt(v))} data-testid="select-edit-product-sales-tax">
                    <SelectTrigger><SelectValue placeholder="Tidak ada pajak default" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tidak ada pajak default</SelectItem>
                      {saleTaxes.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Tarif Pajak Pembelian Default</Label>
                  <Select value={editProdPurchaseTaxId ? String(editProdPurchaseTaxId) : "none"} onValueChange={(v) => setEditProdPurchaseTaxId(v === "none" ? null : parseInt(v))} data-testid="select-edit-product-purchase-tax">
                    <SelectTrigger><SelectValue placeholder="Tidak ada pajak default" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tidak ada pajak default</SelectItem>
                      {purchaseTaxes.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingProduct(null)}>Batal</Button>
                <Button type="submit" disabled={updateProduct.isPending || editImageUploader.isUploading} data-testid="button-save-product">
                  {updateProduct.isPending ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* EDIT ORDER DIALOG */}
      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent>
          {editingOrder && (
            <form onSubmit={handleEditOrder}>
              <DialogHeader>
                <DialogTitle>Edit Order</DialogTitle>
                <DialogDescription>Perbarui detail order pelanggan.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2"><Label htmlFor="edit-customer-name">Nama Pelanggan</Label><Input id="edit-customer-name" name="customerName" defaultValue={editingOrder.customerName} required data-testid="input-edit-order-customer-name" /></div>
                <div className="grid gap-2"><Label htmlFor="edit-customer-email">Email Pelanggan</Label><Input id="edit-customer-email" name="customerEmail" type="email" defaultValue={editingOrder.customerEmail} required data-testid="input-edit-order-customer-email" /></div>
                <div className="grid gap-2"><Label htmlFor="edit-items">Ringkasan Item</Label><Input id="edit-items" name="items" defaultValue={editingOrder.items ?? ""} required data-testid="input-edit-order-items" /></div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-total">Subtotal (IDR)</Label>
                  <Input
                    id="edit-total"
                    type="number"
                    min="0"
                    required
                    value={editSubtotal || ""}
                    onChange={(e) => {
                      const sub = Number(e.target.value) || 0;
                      setEditSubtotal(sub);
                      if (editTaxRateId) setEditTaxAmount(computeTax(sub, editTaxRateId));
                    }}
                    data-testid="input-edit-order-total"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-tax-rate">Tarif PPN</Label>
                    <Select value={editTaxRateId} onValueChange={(v) => handleEditTaxRateChange(v === "none" ? "" : v, editSubtotal)} data-testid="select-edit-tax-rate">
                      <SelectTrigger id="edit-tax-rate" data-testid="select-trigger-edit-tax-rate"><SelectValue placeholder="Tidak ada PPN" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Tidak ada PPN</SelectItem>
                        {saleTaxes.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.name} ({Number(t.rate).toFixed(0)}%)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-tax-amount">PPN (IDR)</Label>
                    <Input
                      id="edit-tax-amount"
                      type="number"
                      min="0"
                      value={editTaxAmount}
                      readOnly
                      className="bg-muted text-muted-foreground cursor-not-allowed"
                      data-testid="input-edit-order-tax"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-status">Status</Label>
                    <Select value={editOrderStatus} onValueChange={(v) => setEditOrderStatus(v as OrderStatus)}>
                      <SelectTrigger id="edit-status" data-testid="select-edit-order-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map(s => (
                          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingOrder(null)}>Batal</Button>
                <Button type="submit" disabled={updateOrder.isPending} data-testid="button-save-order">
                  {updateOrder.isPending ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* DELETE PRODUCT CONFIRMATION */}
      <AlertDialog open={!!deletingProduct} onOpenChange={(open) => !open && setDeletingProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus produk ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Produk <strong>{deletingProduct?.name}</strong> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-product">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteProduct} disabled={deleteProduct.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-product">
              {deleteProduct.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE ORDER CONFIRMATION */}
      <AlertDialog open={!!deletingOrder} onOpenChange={(open) => !open && setDeletingOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus order ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Order <strong>#ORD-{deletingOrder?.id.toString().padStart(4, '0')}</strong> dari {deletingOrder?.customerName} akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-order">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteOrder} disabled={deleteOrder.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-order">
              {deleteOrder.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* INVOICE PRINT DIALOG */}
      {printingOrder && (
        <OrderInvoiceDialog
          order={printingOrder}
          formatIDR={formatIDR}
          onClose={() => setPrintingOrder(null)}
        />
      )}
    </AppShell>
  );
}

interface OrderInvoiceDialogProps {
  order: Order;
  formatIDR: (v: number) => string;
  onClose: () => void;
}

function OrderInvoiceDialog({ order, formatIDR, onClose }: OrderInvoiceDialogProps) {
  const orderId = `#ORD-${order.id.toString().padStart(4, '0')}`;
  const date = new Date(order.createdAt).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const subtotal = order.totalAmount;
  const tax = order.taxAmount ?? 0;
  const grand = order.grandTotal ?? (subtotal + tax);
  const taxPct = subtotal > 0 && tax > 0 ? Math.round((tax / subtotal) * 100) : 11;

  const handlePrint = () => {
    window.print();
  };

  const printContent = (
    <div id="order-invoice-print-root" style={{ display: 'none' }}>
      <style>{`
        @media print {
          body > *:not(#order-invoice-print-root) { display: none !important; }
          #order-invoice-print-root { display: block !important; position: fixed; inset: 0; background: white; z-index: 99999; padding: 40px; box-sizing: border-box; }
        }
      `}</style>
      <div style={{ maxWidth: 600, margin: '0 auto', fontFamily: 'sans-serif', color: '#000' }}>
        <div style={{ borderBottom: '2px solid #000', paddingBottom: 16, marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>INVOICE</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#555' }}>BizPortal</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Tagihan Kepada:</p>
            <p style={{ margin: 0 }}>{order.customerName}</p>
            <p style={{ margin: 0, color: '#555' }}>{order.customerEmail}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{orderId}</p>
            <p style={{ margin: 0, color: '#555' }}>{date}</p>
          </div>
        </div>
        {order.items && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Item:</p>
            <p style={{ margin: 0, color: '#333', whiteSpace: 'pre-wrap' }}>{order.items}</p>
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px 0', borderTop: '1px solid #ddd' }}>Subtotal</td>
              <td style={{ padding: '8px 0', borderTop: '1px solid #ddd', textAlign: 'right' }}>{formatIDR(subtotal)}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0', borderTop: '1px solid #ddd' }}>PPN {taxPct}%</td>
              <td style={{ padding: '8px 0', borderTop: '1px solid #ddd', textAlign: 'right' }}>{formatIDR(tax)}</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 0', borderTop: '2px solid #000', fontWeight: 700, fontSize: 16 }}>Grand Total</td>
              <td style={{ padding: '12px 0', borderTop: '2px solid #000', textAlign: 'right', fontWeight: 700, fontSize: 16 }}>{formatIDR(grand)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 32, fontSize: 12, color: '#888', textAlign: 'center' }}>
          Terima kasih atas pembelian Anda.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(printContent, document.body)}

      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg" data-testid="dialog-invoice">
          <DialogHeader>
            <DialogTitle>Invoice {orderId}</DialogTitle>
            <DialogDescription>Pratinjau invoice dengan rincian PPN sebelum dicetak.</DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-white text-foreground p-6 space-y-4" data-testid="invoice-preview">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Tagihan Kepada</p>
                <p className="font-medium">{order.customerName}</p>
                <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Tanggal</p>
                <p className="font-medium text-sm">{date}</p>
              </div>
            </div>

            {order.items && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Item</p>
                <p className="text-sm">{order.items}</p>
              </div>
            )}

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm" data-testid="invoice-subtotal">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatIDR(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm" data-testid="invoice-tax">
                <span className="text-muted-foreground">PPN {taxPct}%</span>
                <span>{formatIDR(tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-2" data-testid="invoice-grand-total">
                <span>Grand Total</span>
                <span>{formatIDR(grand)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} className="no-print">Tutup</Button>
            <Button onClick={handlePrint} className="no-print" data-testid="button-print-invoice">
              <Printer className="h-4 w-4 mr-2" /> Cetak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProductThumb({ src, alt, size = "sm" }: { src: string | null; alt: string; size?: "sm" | "md" }) {
  const dims = size === "md" ? "h-14 w-14" : "h-10 w-10";
  if (!src) {
    return (
      <div className={`${dims} rounded-md border border-dashed bg-muted flex items-center justify-center text-muted-foreground shrink-0`} aria-label="Belum ada gambar">
        <ImageIcon className="h-4 w-4 opacity-60" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={`${dims} rounded-md object-cover border shrink-0`} loading="lazy" />;
}

interface ProductImageFieldProps {
  imageUrl: string | null;
  isUploading: boolean;
  onPickFile: (file: File) => void;
  onRemove: () => void;
  resolveImage: (url?: string | null) => string | null;
  idPrefix: string;
}

function ProductImageField({ imageUrl, isUploading, onPickFile, onRemove, resolveImage, idPrefix }: ProductImageFieldProps) {
  const inputId = `${idPrefix}-product-image-input`;
  const preview = resolveImage(imageUrl);
  return (
    <div className="grid gap-2">
      <Label>Foto Produk</Label>
      <div className="flex items-center gap-3">
        <ProductThumb src={preview} alt="Pratinjau produk" size="md" />
        <div className="flex-1 flex flex-wrap gap-2">
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid={`input-${idPrefix}-product-image`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => document.getElementById(inputId)?.click()} data-testid={`button-${idPrefix}-upload-image`}>
            {isUploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-1.5" />}
            {isUploading ? "Mengunggah..." : imageUrl ? "Ganti Foto" : "Unggah Foto"}
          </Button>
          {imageUrl && !isUploading && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-muted-foreground hover:text-destructive" data-testid={`button-${idPrefix}-remove-image`}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Hapus
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Format: JPG/PNG, maks 10MB.</p>
    </div>
  );
}
