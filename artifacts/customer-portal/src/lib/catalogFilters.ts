export interface MarketplaceItem {
  id: number;
  vendorId: number;
  vendorName: string | null;
  templateKind: string | null;
  categoryKey: string | null;
  serviceType: string | null;
  templateId: string | null;
  templateSnapshot: unknown;
  name: string;
  description: string | null;
  kategori: string | null;
  subcategory: string | null;
  specValues: unknown;
  priceSell: number | null;
  currency: string;
  unit: string | null;
  moq: number | null;
  stockStatus: string | null;
  stockQty: number | null;
  leadTime: string | null;
  location: string | null;
  origin: string | null;
  validityDate: string | null;
  documents: unknown;
  publishedAt: string | null;
  sortOrder: number;
}

export type FilterType = "select" | "number-range" | "text-search";

export interface FilterFieldDef {
  key: string;
  label: string;
  type: FilterType;
  options?: string[];
  min?: number;
  max?: number;
  source: "template" | "standard";
}

export type ActiveFilters = Record<string, string | string[] | [number | null, number | null] | null>;

function getSpecValues(item: MarketplaceItem): Record<string, unknown> {
  if (!item.specValues || typeof item.specValues !== "object") return {};
  return item.specValues as Record<string, unknown>;
}

function getTemplateFields(snapshot: unknown): Array<{ key: string; label: string; type: string; options?: string[]; section?: string }> {
  if (!snapshot || typeof snapshot !== "object") return [];
  const s = snapshot as Record<string, unknown>;

  if (Array.isArray(s["customFields"])) {
    return s["customFields"] as Array<{ key: string; label: string; type: string; options?: string[] }>;
  }
  if (Array.isArray(s["fields"])) {
    return (s["fields"] as Array<{ key: string; label: string; type: string; options?: string[]; section?: string }>)
      .filter((f) => f.section === "quotation" || f.section === "both");
  }
  return [];
}

export function buildCatalogFilters(items: MarketplaceItem[]): FilterFieldDef[] {
  const filters: FilterFieldDef[] = [];

  // ── 1. Standard filters ────────────────────────────────────────────────────
  const vendors = [...new Set(items.map((i) => i.vendorName).filter(Boolean) as string[])];
  if (vendors.length > 1) {
    filters.push({ key: "__vendor", label: "Vendor", type: "select", options: vendors, source: "standard" });
  }

  const stockStatuses = [...new Set(items.map((i) => i.stockStatus).filter(Boolean) as string[])];
  if (stockStatuses.length > 0) {
    filters.push({ key: "__stockStatus", label: "Status Stok", type: "select", options: stockStatuses, source: "standard" });
  }

  const locations = [...new Set(items.map((i) => i.location).filter(Boolean) as string[])];
  if (locations.length > 1) {
    filters.push({ key: "__location", label: "Lokasi", type: "select", options: locations, source: "standard" });
  }

  const origins = [...new Set(items.map((i) => i.origin).filter(Boolean) as string[])];
  if (origins.length > 1) {
    filters.push({ key: "__origin", label: "Asal", type: "select", options: origins, source: "standard" });
  }

  const prices = items.map((i) => i.priceSell).filter((p) => p !== null) as number[];
  if (prices.length > 0) {
    filters.push({
      key: "__priceSell",
      label: "Harga Jual",
      type: "number-range",
      min: Math.min(...prices),
      max: Math.max(...prices),
      source: "standard",
    });
  }

  // ── 2. Template-derived filters ────────────────────────────────────────────
  const templateFieldMap = new Map<string, FilterFieldDef & { _values: Set<string>; _numbers: number[] }>();

  for (const item of items) {
    const fields = getTemplateFields(item.templateSnapshot);
    const specVals = getSpecValues(item);

    for (const field of fields) {
      if (field.type === "textarea" || field.type === "date") continue;

      const existing = templateFieldMap.get(field.key);
      const rawVal = specVals[field.key];

      if (field.type === "select") {
        if (!existing) {
          templateFieldMap.set(field.key, {
            key: field.key,
            label: field.label,
            type: "select",
            options: field.options ?? [],
            source: "template",
            _values: new Set<string>(),
            _numbers: [],
          });
        }
        if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "") {
          templateFieldMap.get(field.key)!._values.add(String(rawVal));
        }
      } else if (field.type === "number") {
        if (!existing) {
          templateFieldMap.set(field.key, {
            key: field.key,
            label: field.label,
            type: "number-range",
            source: "template",
            _values: new Set<string>(),
            _numbers: [],
          });
        }
        const n = Number(rawVal);
        if (!isNaN(n) && rawVal !== null && rawVal !== undefined) {
          templateFieldMap.get(field.key)!._numbers.push(n);
        }
      } else if (field.type === "text") {
        if (!existing) {
          templateFieldMap.set(field.key, {
            key: field.key,
            label: field.label,
            type: "select",
            source: "template",
            _values: new Set<string>(),
            _numbers: [],
          });
        }
        if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "") {
          templateFieldMap.get(field.key)!._values.add(String(rawVal));
        }
      }
    }
  }

  for (const [, def] of templateFieldMap) {
    if (def.type === "select") {
      const uniqueVals = [...def._values];
      if (uniqueVals.length < 2) continue;
      // Try to preserve template option ordering; fall back to actual unique values
      // when none of the template options match the actual data (e.g. vendor uses
      // custom grade terminology like "Grade B" vs template's "Grade 1").
      const optsByTemplate = def.options && def.options.length > 0
        ? def.options.filter((o) => uniqueVals.includes(o))
        : [];
      const opts = optsByTemplate.length >= 2 ? optsByTemplate : uniqueVals;
      if (opts.length < 2) continue;
      filters.push({ key: def.key, label: def.label, type: "select", options: opts, source: "template" });
    } else if (def.type === "number-range") {
      if (def._numbers.length < 2) continue;
      const mn = Math.min(...def._numbers);
      const mx = Math.max(...def._numbers);
      if (mn === mx) continue;
      filters.push({ key: def.key, label: def.label, type: "number-range", min: mn, max: mx, source: "template" });
    }
  }

  return filters;
}

export function matchVendorCatalog(item: MarketplaceItem, active: ActiveFilters): boolean {
  const specVals = getSpecValues(item);

  for (const [key, value] of Object.entries(active)) {
    if (value === null || value === undefined) continue;

    // ── Standard filters ───────────────────────────────────────────────────
    if (key === "__vendor") {
      if (item.vendorName !== value) return false;
      continue;
    }
    if (key === "__stockStatus") {
      if (item.stockStatus !== value) return false;
      continue;
    }
    if (key === "__location") {
      if (item.location !== value) return false;
      continue;
    }
    if (key === "__origin") {
      if (item.origin !== value) return false;
      continue;
    }
    if (key === "__priceSell") {
      const [mn, mx] = value as [number | null, number | null];
      if (mn !== null && (item.priceSell === null || item.priceSell < mn)) return false;
      if (mx !== null && (item.priceSell === null || item.priceSell > mx)) return false;
      continue;
    }
    if (key === "__search") {
      const q = String(value).toLowerCase().trim();
      if (!q) continue;
      const haystack = [item.name, item.description, item.vendorName, item.kategori].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
      continue;
    }

    // ── Template-derived filters ───────────────────────────────────────────
    const rawVal = specVals[key];

    if (Array.isArray(value)) {
      // number-range
      const [mn, mx] = value as [number | null, number | null];
      if (mn === null && mx === null) continue;
      const n = Number(rawVal);
      if (isNaN(n)) return false;
      if (mn !== null && n < mn) return false;
      if (mx !== null && n > mx) return false;
    } else if (typeof value === "string" && value.trim() !== "") {
      if (rawVal === undefined || rawVal === null) return false;
      if (String(rawVal).toLowerCase() !== value.toLowerCase()) return false;
    }
  }

  return true;
}
