const BASE = "https://images.unsplash.com/photo-";
const W = "?w=800&q=80&auto=format&fit=crop";

// Local HD images bundled with the app (always available, no external dependency)
const LOCAL = (path: string) => `${import.meta.env.BASE_URL}images/${path}`;

// ── Service images (order: most-specific first) ──────────────────────────────
// All service images use local HD photos — no external URL dependency.
const SERVICE_IMAGES: Array<{ keywords: string[]; url: string }> = [
  {
    keywords: ["trucking", "truck", "container", "angkut", "darat", "sewa container", "truk"],
    url: `${BASE}1558618666-fcd25c85cd64${W}`,
  },
  {
    keywords: ["ocean freight", "sea freight", "freight laut", "laut lcl", "laut fcl", "laut", "kapal", "fcl", "lcl", "ocean"],
    url: LOCAL("sea-freight.png"),
  },
  {
    keywords: ["air freight", "freight udara", "udara", "pesawat", "airfreight", "cargo udara", "handling cargo udara"],
    url: LOCAL("air-freight.png"),
  },
  {
    keywords: ["handling", "bongkar", "muat", "warehouse", "gudang", "biaya storage", "storage", "depo", "depot", "penyimpanan"],
    url: LOCAL("warehouse.png"),
  },
  {
    keywords: ["pabean", "customs", "ppjk", "kepabeanan", "bea cukai", "clearance", "dokumen", "pengurusan"],
    url: LOCAL("customs.png"),
  },
  {
    keywords: ["freight forwarding", "forwarding", "ekspor", "impor", "international", "internasional", "port", "pelabuhan"],
    url: LOCAL("port-operations.png"),
  },
];

const DEFAULT_SERVICE = `${BASE}1586528116311-ad8dd3c8310d${W}`;

// ── Product images (order: most-specific first) ──────────────────────────────
// All IDs below are verified HTTP 200 as of 2026-05.
const PRODUCT_IMAGES: Array<{ keywords: string[]; url: string }> = [
  // --- Highly specific product names / brands ---
  {
    // MacBook on wooden desk — clean HD photo
    keywords: ["laptop", "notebook", "asus", "acer", "lenovo", "macbook", "vivobook", "thinkpad"],
    url: `${BASE}1496181133206-80ce9b88a853${W}`,
  },
  {
    // Smartphone on neutral bg
    keywords: ["samsung", "galaxy", "oppo", "xiaomi", "iphone", "smartphone", "handphone", "hp ", "android"],
    url: `${BASE}1511707171634-5f897ff02aa9${W}`,
  },
  {
    // POS/cash register
    keywords: ["pos", "kasir", "point of sale", "cash register"],
    url: `${BASE}1556742049-0cfed4f6a45d${W}`,
  },
  // --- Product categories ---
  {
    // Sofa/furniture
    keywords: ["furniture", "meja", "kursi", "sofa", "lemari", "cabinet", "chair", "table", "desk", "kantor"],
    url: `${BASE}1555041469-a586c61ea9bc${W}`,
  },
  {
    // Coffee beans
    keywords: ["kopi", "coffee", "green bean", "biji kopi", "arabika", "robusta", "arabica"],
    url: `${BASE}1447933601403-0c6688de566e${W}`,
  },
  {
    // Shopping bags — covers retail/fashion/clothing/garment
    keywords: ["textile", "tekstil", "kain", "fabric", "garment", "pakaian", "baju", "benang", "jahit", "fashion", "clothing"],
    url: `${BASE}1607082348824-0a96f2a4b9da${W}`,
  },
  {
    // Stationery flat lay
    keywords: ["alat tulis", "stationery", "stasioner", "pensil", "pulpen", "buku", "kertas", "atk"],
    url: `${BASE}1513542789411-b6a5d4f31634${W}`,
  },
  {
    // Leather bag
    keywords: ["tas", "bag", "backpack", "koper", "ransel", "suitcase"],
    url: `${BASE}1553062407-98eeb64c6a62${W}`,
  },
  {
    // Tools / hardware
    keywords: ["alat", "tool", "hardware", "perkakas", "mesin", "bor", "machine", "printer", "mesin cetak", "scanner", "laserjet", "inkjet", "epson", "canon"],
    url: `${BASE}1518709268805-4e9042af9f23${W}`,
  },
  {
    // Food / pantry
    keywords: ["makanan", "food", "minuman", "beverage", "snack", "sembako", "beras", "minyak"],
    url: `${BASE}1490818387583-1baba5e638af${W}`,
  },
  {
    // Electronics accessories (headphones + keyboard) — generic catch-all LAST
    keywords: ["elektronik", "electronic", "gadget", "komputer", "computer", "pc"],
    url: `${BASE}1550009158-9ebf69173e03${W}`,
  },
];

// Cardboard boxes / packages — neutral default
const DEFAULT_PRODUCT = `${BASE}1553877522-43269d4ea984${W}`;

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
  // Name + subcategory first (more specific), then categories
  const haystack = [name, subcategory ?? "", ...categories].join(" ");
  return matchKeywords(PRODUCT_IMAGES, haystack) ?? DEFAULT_PRODUCT;
}
