"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { getBallot } from "@/lib/agent";
import type { Ballot } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import { PageBackdrop } from "@/components/page-backdrop";
import { BallotHeader } from "@/components/ballot-header";

export default function InfoPage() {
  const params = useParams();
  const id = params.id as string;
  const locale = useLocale();
  const t = useTranslations("vorlage");
  const tc = useTranslations("common");

  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBallot(await getBallot(id, locale));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-[var(--page-max)] mx-auto pt-5 space-y-5 pb-[35vh]">
      <PageBackdrop src="/images/stockhorn.svg" />

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Spinner />
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>
              <strong>{tc("error")}:</strong> {error}
            </span>
            <Button variant="destructive" size="sm" onClick={load}>
              {tc("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && ballot && <BallotHeader ballot={ballot} />}

      {/* Weitere Detail-Infos zur Vorlage folgen später. */}
      {!loading && ballot && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("comingSoon")}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
