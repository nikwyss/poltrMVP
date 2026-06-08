"use client";

/**
 * Modal zum Erstellen eines neuen Arguments (PRO/CONTRA + Titel + Text).
 * Geteilt zwischen Feed-View und Taxonomy-View, damit der „+ Neues Argument"-
 * Flow überall identisch ist. Schreibt via `createArgument` (app.ch.poltr.argument.create).
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { createArgument } from "@/lib/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function AddArgumentModal({
  ballotRkey,
  open,
  onOpenChange,
  onCreated,
}: {
  ballotRkey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("feed");
  const tc = useTranslations("common");
  const currentLocale = useLocale();
  const [argType, setArgType] = useState<"PRO" | "CONTRA">("PRO");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await createArgument(ballotRkey, title.trim(), body.trim(), argType, [currentLocale]);
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create argument");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addArgument")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {(["PRO", "CONTRA"] as const).map((typ) => {
              const selected = argType === typ;
              const isPro = typ === "PRO";
              return (
                <Button
                  key={typ}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  className="flex-1"
                  style={
                    selected
                      ? {
                          backgroundColor: isPro
                            ? "var(--pro)"
                            : "var(--contra)",
                          color: "#fff",
                        }
                      : undefined
                  }
                  onClick={() => setArgType(typ)}
                >
                  {isPro ? tc("pro") : tc("contra")}
                </Button>
              );
            })}
          </div>

          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
          />

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("yourArgument")}
            rows={5}
          />

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !body.trim() || submitting}>
            {submitting ? t("creating") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddArgumentModal;
