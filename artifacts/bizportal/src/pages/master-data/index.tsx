import { AppShell } from "@/components/layout/AppShell";
import { ModuleHub } from "@/components/layout/ModuleHub";
import {
  Database, PackageSearch, FlaskConical, Boxes, Layers,
  Tags, Package,
} from "lucide-react";

export default function MasterDataHubPage() {
  return (
    <AppShell>
      <ModuleHub
        moduleIcon={Database}
        moduleName="Master Data"
        moduleDesc="Kelola data induk produk, bahan baku, katalog, dan satuan"
        cards={[
          {
            href: "/products/items",
            icon: PackageSearch,
            title: "Produk & Bahan Baku",
            desc: "Daftar semua produk, bahan baku, dan material",
          },
          {
            href: "/products/recipes",
            icon: FlaskConical,
            title: "Recipe / BOM",
            desc: "Bill of Materials dan formula produksi",
          },
          {
            href: "/sales/items",
            icon: Boxes,
            title: "Item Penjualan",
            desc: "Daftar layanan dan item yang dijual ke pelanggan",
          },
          {
            href: "/katalog-terpadu",
            icon: Layers,
            title: "Katalog Terpadu",
            desc: "Gabungan semua katalog produk dan layanan",
          },
          {
            href: "/settings/uom",
            icon: Tags,
            title: "Satuan (UOM)",
            desc: "Kelola satuan ukur yang digunakan dalam transaksi",
          },
          {
            href: "/settings/logistics-units",
            icon: Package,
            title: "Satuan Pengiriman",
            desc: "Satuan khusus untuk perhitungan biaya logistik",
          },
        ]}
      />
    </AppShell>
  );
}
