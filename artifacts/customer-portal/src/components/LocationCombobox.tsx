import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";

export type GeoLocation = {
  label: string;
  lat: number;
  lon: number;
};

type Props = {
  value: string;
  onChange: (label: string, geo?: GeoLocation) => void;
  placeholder?: string;
  className?: string;
};

export function LocationCombobox({ value, onChange, placeholder = "Ketik nama kota...", className }: Props) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 3) { setResults([]); return; }
    setLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1&accept-language=id,en`;
      const res = await fetch(url, { headers: { "Accept-Language": "id,en" } });
      const data = await res.json();
      setResults(
        (data as Array<{ display_name: string; lat: string; lon: string }>).map((item) => ({
          label: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
        }))
      );
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    onChange(val, undefined);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 500);
  }

  function handleSelect(geo: GeoLocation) {
    const short = geo.label.split(",").slice(0, 3).join(", ");
    setQuery(short);
    onChange(short, geo);
    setOpen(false);
    setResults([]);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = open && (results.length > 0 || loading);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin pointer-events-none" />}
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => { setOpen(true); if (query.length >= 3) search(query); }}
          placeholder={placeholder}
          className="mt-1 pl-9"
          autoComplete="off"
        />
      </div>
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {loading && results.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Mencari lokasi...
            </div>
          )}
          {results.map((geo, idx) => {
            const parts = geo.label.split(",");
            const title = parts.slice(0, 2).join(",");
            const sub = parts.slice(2, 5).join(",");
            return (
              <button
                key={idx}
                type="button"
                onMouseDown={() => handleSelect(geo)}
                className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-accent/5 transition-colors border-b border-border/50 last:border-0"
              >
                <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{title}</p>
                  {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
