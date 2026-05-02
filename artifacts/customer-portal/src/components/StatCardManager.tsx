import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useEditMode } from "@/contexts/EditModeContext";
import {
  Package, Truck, Ship, Plane, Box, Archive, BarChart2, Layers,
  Navigation, Globe, Anchor, Activity, TrendingUp, Users, ClipboardList,
  Plus, Trash2, GripVertical, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ALL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, Truck, Ship, Plane, Box, Archive, BarChart2, Layers,
  Navigation, Globe, Anchor, Activity, TrendingUp, Users, ClipboardList,
};

const COLORS = [
  { key: "blue",   bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   num: "text-blue-800" },
  { key: "green",  bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  num: "text-green-800" },
  { key: "purple", bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", num: "text-purple-800" },
  { key: "orange", bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", num: "text-orange-800" },
  { key: "pink",   bg: "bg-pink-50",   border: "border-pink-200",   text: "text-pink-700",   num: "text-pink-800" },
  { key: "teal",   bg: "bg-teal-50",   border: "border-teal-200",   text: "text-teal-700",   num: "text-teal-800" },
  { key: "yellow", bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", num: "text-yellow-800" },
  { key: "red",    bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    num: "text-red-800" },
];

const METRICS = [
  { key: "total",      label: "Total Pesanan" },
  { key: "pending",    label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "shipped",    label: "Shipped" },
  { key: "delivered",  label: "Delivered" },
  { key: "cancelled",  label: "Cancelled" },
  { key: "active",     label: "Aktif (processing+shipped)" },
];

export interface StatCard {
  id: string;
  label: string;
  colorKey: string;
  iconKey: string;
  metric: string;
}

const DEFAULT_CARDS: StatCard[] = [
  { id: "pending",    label: "Pending",    colorKey: "yellow", iconKey: "ClipboardList", metric: "pending" },
  { id: "processing", label: "Processing", colorKey: "blue",   iconKey: "Activity",      metric: "processing" },
  { id: "shipped",    label: "Shipped",    colorKey: "purple", iconKey: "Ship",          metric: "shipped" },
  { id: "delivered",  label: "Delivered",  colorKey: "green",  iconKey: "Package",       metric: "delivered" },
  { id: "cancelled",  label: "Cancelled",  colorKey: "red",    iconKey: "X",             metric: "cancelled" },
];

const CONTENT_KEY = "dashboard_stat_cards";

function parseCards(raw: string | undefined): StatCard[] {
  if (!raw) return DEFAULT_CARDS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CARDS;
  } catch {
    return DEFAULT_CARDS;
  }
}

export function useStatCards() {
  const { content, updateField } = useEditMode();
  const cards = parseCards(content[CONTENT_KEY]);

  const setCards = useCallback((next: StatCard[]) => {
    updateField(CONTENT_KEY, JSON.stringify(next));
  }, [updateField]);

  return { cards, setCards };
}

export function getCardColor(colorKey: string) {
  return COLORS.find((c) => c.key === colorKey) ?? COLORS[0];
}

interface StatCardDisplayProps {
  card: StatCard;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

export function StatCardDisplay({ card, count, isActive, onClick }: StatCardDisplayProps) {
  const colors = getCardColor(card.colorKey);
  const IconComp = ALL_ICONS[card.iconKey] ?? Package;

  return (
    <button
      onClick={onClick}
      className={`${colors.bg} border ${colors.border} rounded-lg p-3 text-left transition-all hover:shadow-sm w-full ${
        isActive ? "ring-2 ring-offset-1 ring-current" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <p className={`text-2xl font-bold ${colors.num}`}>{count}</p>
        <IconComp className={`h-5 w-5 ${colors.text} opacity-50`} />
      </div>
      <p className={`text-xs font-medium ${colors.text} leading-tight`}>{card.label}</p>
    </button>
  );
}

interface CardEditorProps {
  card: StatCard;
  onChange: (c: StatCard) => void;
  onDelete: () => void;
  dragHandleProps: { onMouseDown: (e: React.MouseEvent) => void };
  isDragging: boolean;
}

function CardEditor({ card, onChange, onDelete, dragHandleProps, isDragging }: CardEditorProps) {
  const colors = getCardColor(card.colorKey);
  const IconComp = ALL_ICONS[card.iconKey] ?? Package;

  return (
    <div className={`${colors.bg} border-2 ${colors.border} rounded-xl p-3 flex items-center gap-3 transition-all ${isDragging ? "opacity-50 scale-95" : ""}`}>
      <div
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-5 w-5" />
      </div>

      <IconComp className={`h-5 w-5 ${colors.text} flex-shrink-0`} />

      <div className="flex-1 min-w-0 space-y-1.5">
        <Input
          value={card.label}
          onChange={(e) => onChange({ ...card, label: e.target.value })}
          className="h-7 text-xs font-medium bg-white/70 border-0 focus-visible:ring-1"
          placeholder="Label"
        />
        <div className="flex gap-1.5 flex-wrap">
          {/* Color picker */}
          {COLORS.map((c) => (
            <button
              key={c.key}
              title={c.key}
              onClick={() => onChange({ ...card, colorKey: c.key })}
              className={`w-4 h-4 rounded-full ${c.bg} border-2 transition-transform ${card.colorKey === c.key ? `${c.border} scale-125` : "border-transparent"}`}
            />
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {/* Icon picker */}
          {Object.entries(ALL_ICONS).map(([key, Icon]) => (
            <button
              key={key}
              title={key}
              onClick={() => onChange({ ...card, iconKey: key })}
              className={`p-0.5 rounded transition-colors ${card.iconKey === key ? `${colors.text} bg-white/80` : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        <select
          value={card.metric}
          onChange={(e) => onChange({ ...card, metric: e.target.value })}
          className="text-xs border rounded px-1.5 py-0.5 bg-white/70 w-full"
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      <button
        onClick={onDelete}
        className="text-muted-foreground hover:text-red-500 flex-shrink-0 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

interface StatCardManagerProps {
  orders: Array<{ status: string }>;
  statusFilter: string;
  onFilterChange: (s: string) => void;
}

export function StatCardManagerPanel({ orders, statusFilter, onFilterChange }: StatCardManagerProps) {
  const { editMode } = useEditMode();
  const { cards, setCards } = useStatCards();
  const [showEditor, setShowEditor] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const getCount = (metric: string) => {
    if (metric === "total") return orders.length;
    if (metric === "active") return orders.filter((o) => o.status === "processing" || o.status === "shipped").length;
    return orders.filter((o) => o.status === metric).length;
  };

  const addCard = () => {
    const newCard: StatCard = {
      id: `card_${Date.now()}`,
      label: "Custom Card",
      colorKey: "blue",
      iconKey: "Package",
      metric: "total",
    };
    setCards([...cards, newCard]);
  };

  const updateCard = (idx: number, card: StatCard) => {
    const next = [...cards];
    next[idx] = card;
    setCards(next);
  };

  const deleteCard = (idx: number) => {
    setCards(cards.filter((_, i) => i !== idx));
  };

  const handleDragStart = (idx: number) => {
    dragIndex.current = idx;
    setDraggingIdx(idx);
  };

  const handleDragOver = (idx: number) => {
    if (dragIndex.current === null || dragIndex.current === idx) return;
    const next = [...cards];
    const [moved] = next.splice(dragIndex.current, 1);
    next.splice(idx, 0, moved);
    dragIndex.current = idx;
    setDraggingIdx(idx);
    setCards(next);
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    setDraggingIdx(null);
  };

  if (editMode) {
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Status Cards</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowEditor(!showEditor)}>
              {showEditor ? <><Check className="h-3 w-3" /> Selesai</> : <><GripVertical className="h-3 w-3" /> Atur Cards</>}
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={addCard}>
              <Plus className="h-3 w-3" /> Tambah Card
            </Button>
          </div>
        </div>

        {showEditor ? (
          <div className="space-y-2">
            {cards.map((card, idx) => (
              <div
                key={card.id}
                onDragOver={(e) => { e.preventDefault(); handleDragOver(idx); }}
                onDrop={handleDragEnd}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnd={handleDragEnd}
              >
                <CardEditor
                  card={card}
                  onChange={(c) => updateCard(idx, c)}
                  onDelete={() => deleteCard(idx)}
                  dragHandleProps={{ onMouseDown: () => {} }}
                  isDragging={draggingIdx === idx}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {cards.map((card) => (
              <StatCardDisplay
                key={card.id}
                card={card}
                count={getCount(card.metric)}
                isActive={statusFilter === card.metric}
                onClick={() => onFilterChange(statusFilter === card.metric ? "" : card.metric)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const [, setLocation] = useLocation();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
      {cards.map((card) => (
        <StatCardDisplay
          key={card.id}
          card={card}
          count={getCount(card.metric)}
          isActive={false}
          onClick={() =>
            setLocation(
              card.metric === "total" ? "/orders" : `/orders?status=${encodeURIComponent(card.metric)}`
            )
          }
        />
      ))}
    </div>
  );
}
