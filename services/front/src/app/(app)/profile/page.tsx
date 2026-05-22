"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState, Suspense } from "react";
import { useTranslations } from "next-intl";
import { initiateEidVerification } from "@/lib/agent";
import { useAppPassword } from "@/lib/useAppPassword";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import { Copy, Check, Mountain } from "lucide-react";

function CopyField({
  label,
  value,
  breakAll,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const tc = useTranslations("common");

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <p
      className="my-2 flex items-center gap-2"
      style={{ wordBreak: breakAll ? "break-all" : undefined }}
    >
      <strong>{label}:</strong>
      <code className="bg-muted px-2 py-1 rounded font-mono flex-1 text-sm">
        {value}
      </code>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        title={copied ? tc("copied") : tc("copy", { label: label.toLowerCase() })}
        className="h-8 w-8 shrink-0"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </p>
  );
}

function ProfileContent() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const {
    appPassword,
    loading: appPasswordLoading,
    error: appPasswordError,
    handleCreateAppPassword,
  } = useAppPassword();
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get("verified") === "true") {
      setVerificationSuccess(true);
    }
    if (searchParams.get("error") === "verification_failed") {
      setVerificationError(t("verificationFailed"));
    }
  }, [searchParams, t]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3">
        <Spinner />
        <span className="text-muted-foreground">{tc("restoringSession")}</span>
      </div>
    );
  }

  if (!user) return null;

  const handleStartVerification = async () => {
    setVerificationLoading(true);
    setVerificationError(null);
    try {
      const { redirect_url } = await initiateEidVerification();
      window.location.href = redirect_url;
    } catch (err) {
      setVerificationError(
        err instanceof Error ? err.message : "Failed to start verification"
      );
      setVerificationLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-8 pt-6">
      {/* Left: logo */}
      <div className="flex items-start justify-center md:w-64 shrink-0">
        <img src="/logo5.svg" alt="Poltr" className="w-32 h-32 md:w-48 md:h-48" />
      </div>

      {/* Right: content */}
      <div className="flex-1 space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("hello", { name: user.displayName })}
        </h1>

        {/* Pseudonym card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Mountain className="h-5 w-5" />
              {t("pseudonym")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              {t("pseudonymExplanation")}
              {user.mountainFullname && (
                <>
                  {" "}
                  {t("pseudonymSource", {
                    mountain: user.mountainFullname,
                    canton: user.canton ?? "—",
                    height:
                      user.height != null
                        ? Math.round(user.height).toLocaleString("de-CH")
                        : "—",
                  })}
                </>
              )}
            </p>
            <div className="space-y-1 text-sm">
              <p>
                <strong>{t("displayName")}:</strong>{" "}
                <span className="font-mono">{user.displayName}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Technical identity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t("identity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <p>
                <strong>{t("did")}:</strong>{" "}
                <span className="font-mono text-muted-foreground">{user.did}</span>
              </p>
              <p>
                <strong>{t("handle")}:</strong>{" "}
                <span className="font-mono text-muted-foreground">{user.handle}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          {process.env.NEXT_PUBLIC_EID_VERIFICATION_ENABLED === "true" && (
            <Button
              variant="secondary"
              onClick={handleStartVerification}
              disabled={verificationLoading}
            >
              {verificationLoading ? t("starting") : t("swiyuVerification")}
            </Button>
          )}

          {process.env.NEXT_PUBLIC_APP_PASSWORD_ENABLED === "true" && (
            <Button
              variant="secondary"
              onClick={handleCreateAppPassword}
              disabled={appPasswordLoading}
            >
              {appPasswordLoading ? t("creatingPassword") : t("createAppPassword")}
            </Button>
          )}
        </div>

        {/* Status alerts */}
        {process.env.NEXT_PUBLIC_EID_VERIFICATION_ENABLED === "true" &&
          verificationSuccess && (
            <Alert>
              <AlertDescription>{t("verificationSuccess")}</AlertDescription>
            </Alert>
          )}

        {process.env.NEXT_PUBLIC_EID_VERIFICATION_ENABLED === "true" &&
          verificationError && (
            <Alert variant="destructive">
              <AlertDescription>{verificationError}</AlertDescription>
            </Alert>
          )}

        {process.env.NEXT_PUBLIC_APP_PASSWORD_ENABLED === "true" &&
          appPasswordError && (
            <Alert variant="destructive">
              <AlertDescription>{appPasswordError}</AlertDescription>
            </Alert>
          )}

        {process.env.NEXT_PUBLIC_APP_PASSWORD_ENABLED === "true" && appPassword && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-green-800">
                {t("appPasswordCreated")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CopyField
                label={t("pds")}
                value="https://pds2.poltr.info"
              />
              <CopyField label={t("handle")} value={user.handle} />
              <CopyField label={t("password")} value={appPassword.password} breakAll />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function Profile() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <Spinner />
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
