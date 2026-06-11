import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HubCard {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  accent?: string;
}

interface ModuleHubProps {
  moduleIcon: LucideIcon;
  moduleName: string;
  moduleDesc?: string;
  sections?: { label: string; cards: HubCard[] }[];
  cards?: HubCard[];
}

function HubCardItem({ card }: { card: HubCard }) {
  const Icon = card.icon;
  return (
    <Link href={card.href}>
      <Card className="group cursor-pointer border-border bg-card transition-all duration-150 hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 h-full">
        <CardContent className="flex items-start gap-3 p-4">
          <div className={cn(
            "shrink-0 rounded-lg p-2.5 transition-colors",
            card.accent ?? "bg-primary/10 text-primary group-hover:bg-primary/20"
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-semibold leading-tight truncate">{card.title}</h3>
              {card.badge && (
                <Badge variant={card.badgeVariant ?? "secondary"} className="text-[10px] py-0 px-1.5 h-4 shrink-0">
                  {card.badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{card.desc}</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </CardContent>
      </Card>
    </Link>
  );
}

export function ModuleHub({ moduleIcon: ModuleIcon, moduleName, moduleDesc, sections, cards }: ModuleHubProps) {
  const allSections = sections ?? (cards ? [{ label: "", cards }] : []);

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary">
          <ModuleIcon className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{moduleName}</h1>
          {moduleDesc && (
            <p className="text-sm text-muted-foreground mt-0.5">{moduleDesc}</p>
          )}
        </div>
      </div>

      {allSections.map((section, si) => (
        <div key={si} className="space-y-3">
          {section.label && (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              {section.label}
            </h2>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {section.cards.map((card) => (
              <HubCardItem key={card.href} card={card} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
