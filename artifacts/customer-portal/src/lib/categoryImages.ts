const BASE = "https://images.unsplash.com/photo-";

const SERVICE_IMAGES: Array<{ keywords: string[]; url: string }> = [
  {
    keywords: ["trucking", "truck", "container", "angkut", "darat"],
    url: `${BASE}1601584115197-04ecc0da31d7?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["freight laut", "laut", "sea freight", "ocean freight", "kapal", "ship", "fcl", "lcl"],
    url: `${BASE}1494412574-45183d45f4d3?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["freight udara", "udara", "air freight", "pesawat", "airfreight"],
    url: `${BASE}1436491865332-7a61a109cc05?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["handling", "cargo laut", "cargo udara", "warehouse", "gudang", "bongkar", "muat"],
    url: `${BASE}1553413077-190dd305871c?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["pabean", "customs", "ppjk", "kepabeanan", "bea cukai", "clearance", "dokumen"],
    url: `${BASE}1454165804606-c3d57bc86b40?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["storage", "penyimpanan", "depo", "depot"],
    url: `${BASE}1600880292203-757bb62b4baf?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["forwarding", "freight forwarding", "ekspor", "impor", "international"],
    url: `${BASE}1578575437130-527eed3abbec?w=800&q=80&auto=format&fit=crop`,
  },
];

const PRODUCT_IMAGES: Array<{ keywords: string[]; url: string }> = [
  {
    keywords: ["elektronik", "electronic", "gadget", "hp", "handphone", "phone", "samsung", "oppo", "xiaomi"],
    url: `${BASE}1498049794561-7780e7231661?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["laptop", "computer", "notebook", "asus", "acer", "lenovo", "macbook", "pc"],
    url: `${BASE}1496181133206-80ce9b88a853?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["furniture", "meja", "kursi", "sofa", "lemari", "cabinet", "chair", "table", "desk"],
    url: `${BASE}1555041469-a586c61ea9bc?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["kopi", "coffee", "green bean", "biji kopi", "arabika", "robusta", "arabica"],
    url: `${BASE}1447933601403-0c6688de566e?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["textile", "tekstil", "kain", "fabric", "garment", "pakaian", "baju", "benang"],
    url: `${BASE}1558171813-0f58e5aef7bb?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["alat tulis", "stationery", "stasioner", "pensil", "pulpen", "buku", "kertas", "atk"],
    url: `${BASE}1513542789411-b6a5d4f31634?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["printer", "mesin cetak", "tinta", "ink", "scanner"],
    url: `${BASE}1612815154851-d98a4d4f8a6b?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["tas", "bag", "backpack", "koper", "ransel", "suitcase"],
    url: `${BASE}1553062407-98eeb64c6a62?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["alat", "tool", "hardware", "perkakas", "mesin", "machine"],
    url: `${BASE}1518709268805-4e9042af9f23?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["makanan", "food", "minuman", "beverage", "snack", "sembako"],
    url: `${BASE}1490818387583-1baba5e638af?w=800&q=80&auto=format&fit=crop`,
  },
  {
    keywords: ["pos", "kasir", "point of sale", "toko"],
    url: `${BASE}1556742049-0cfed4f6a45d?w=800&q=80&auto=format&fit=crop`,
  },
];

const DEFAULT_SERVICE = `${BASE}1586528116311-ad8dd3c8310d?w=800&q=80&auto=format&fit=crop`;
const DEFAULT_PRODUCT = `${BASE}1523275335684-37898b6baf30?w=800&q=80&auto=format&fit=crop`;

function matchKeywords(
  list: Array<{ keywords: string[]; url: string }>,
  haystack: string
): string | null {
  const lower = haystack.toLowerCase();
  for (const entry of list) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.url;
    }
  }
  return null;
}

export function getServiceFallbackImage(
  categories: string[] = [],
  name = ""
): string {
  const haystack = [...categories, name].join(" ");
  return matchKeywords(SERVICE_IMAGES, haystack) ?? DEFAULT_SERVICE;
}

export function getProductFallbackImage(
  categories: string[] = [],
  name = "",
  subcategory: string | null = null
): string {
  const haystack = [...categories, name, subcategory ?? ""].join(" ");
  return matchKeywords(PRODUCT_IMAGES, haystack) ?? DEFAULT_PRODUCT;
}
