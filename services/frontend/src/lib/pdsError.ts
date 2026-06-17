/**
 * Client-side counterpart to the AppView's categorized PDS errors.
 *
 * The AppView returns `{ error: <code> }` with a matching HTTP status
 * (401/503/400/500) and a `Retry-After` header on 503. The XRPC proxy forwards
 * status + body verbatim (and additionally returns `service_unavailable` 502
 * when the AppView itself is unreachable).
 *
 * `toPdsError` turns a non-ok `Response` into a typed, translatable error and
 * centralizes the 401 → session-expired dispatch (so write helpers in
 * `lib/ballots.ts` participate in the re-auth flow that previously only
 * `lib/agent.ts` triggered).
 */

export type PdsErrorCode =
  | "auth_required"
  | "pds_unavailable"
  | "invalid_request"
  | "internal"
  | "service_unavailable"
  | "unknown";

export interface PdsError {
  code: PdsErrorCode;
  status: number;
  retryAfter?: number;
}

const KNOWN_CODES: PdsErrorCode[] = [
  "auth_required",
  "pds_unavailable",
  "invalid_request",
  "internal",
  "service_unavailable",
];

/** Map a non-ok Response to a typed PdsError, dispatching session-expired on 401. */
export async function toPdsError(res: Response): Promise<PdsError> {
  let code: PdsErrorCode = "unknown";
  try {
    const body = await res.clone().json();
    if (body?.error && KNOWN_CODES.includes(body.error)) {
      code = body.error as PdsErrorCode;
    }
  } catch {
    // non-JSON body — leave as "unknown"
  }

  if (res.status === 401) {
    code = "auth_required";
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("poltr:session-expired"));
    }
  }

  const ra = res.headers.get("Retry-After");
  return {
    code,
    status: res.status,
    retryAfter: ra ? Number(ra) : undefined,
  };
}

/** Narrow a thrown value to a PdsError (helpers throw PdsError on failure). */
export function isPdsError(e: unknown): e is PdsError {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    "status" in e
  );
}

/** Leaf i18n key within the "errors" namespace (use with useTranslations("errors")). */
export function pdsErrorKey(e: PdsError | PdsErrorCode): string {
  const code = typeof e === "string" ? e : e.code;
  if (code === "auth_required") return "auth_required";
  if (code === "pds_unavailable" || code === "service_unavailable")
    return "pds_unavailable";
  if (code === "invalid_request") return "invalid_request";
  return "generic";
}
