import * as React from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

// ─── Generisches Freischalt-Gate (UI) ────────────────────────────────────────
// `LockedSection` ist bewusst „dumm": zeigt `children`, sobald `unlocked`, sonst
// den `placeholder`. Keinerlei Bewertungs-Logik — wiederverwendbar für jedes
// boolesche Gate. Das Kriterium liefert der Aufrufer (z. B. useRatingGate).

export function LockedSection({
  unlocked,
  placeholder,
  children,
}: {
  unlocked: boolean;
  placeholder: React.ReactNode;
  children: React.ReactNode;
}) {
  return <>{unlocked ? children : placeholder}</>;
}

// ─── Wiederverwendbarer Platzhalter ──────────────────────────────────────────
// „Schöne" gesperrte Karte: zentriertes Schloss-Icon, Titel, Beschreibung und
// optional ein schlanker Fortschrittsbalken (value/total) mit Label. Den Text
// und den Fortschritt liefert der Aufrufer — der Platzhalter selbst ist generisch.

export function GatePlaceholder({
  icon,
  title,
  description,
  progress,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  progress?: { value: number; total: number; label?: string };
  className?: string;
}) {
  const pct =
    progress && progress.total > 0
      ? Math.round((Math.min(progress.value, progress.total) / progress.total) * 100)
      : 0;

  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon ?? <Lock className="h-5 w-5" />}
        </div>
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {progress && (
          <div className="mt-1 flex w-full max-w-xs flex-col items-center gap-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            {progress.label && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {progress.label}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
