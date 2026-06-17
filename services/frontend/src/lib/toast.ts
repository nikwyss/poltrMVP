import { toast } from "sonner";
import { type PdsError, pdsErrorKey } from "./pdsError";

// Translator bound to the "errors" namespace, i.e. useTranslations("errors").
type ErrorsTranslator = (key: string) => string;

/**
 * Show a toast for a failed PDS write. `t` must be a translator bound to the
 * "errors" namespace (`useTranslations("errors")`). For an expired session the
 * toast carries a "log in again" action that returns to the start page.
 */
export function notifyPdsError(t: ErrorsTranslator, e: PdsError): void {
  const message = t(pdsErrorKey(e));
  if (e.code === "auth_required") {
    toast.error(message, {
      action: {
        label: t("reLogin"),
        onClick: () => {
          if (typeof window !== "undefined") window.location.assign("/");
        },
      },
    });
    return;
  }
  toast.error(message);
}
