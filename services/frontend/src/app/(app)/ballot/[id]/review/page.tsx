"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";

export default function ReviewPage() {
  const t = useTranslations("vorlage");

  return (
    <div className="max-w-[var(--page-max)] mx-auto pt-5">
      <Card>
        <CardContent className="py-16 text-center space-y-3">
          <h2 className="text-xl font-bold">{t("review")}</h2>
          <p className="text-muted-foreground">{t("comingSoon")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
