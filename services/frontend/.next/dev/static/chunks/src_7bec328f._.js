(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/pdsError.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
 */ __turbopack_context__.s([
    "isPdsError",
    ()=>isPdsError,
    "pdsErrorKey",
    ()=>pdsErrorKey,
    "toPdsError",
    ()=>toPdsError
]);
const KNOWN_CODES = [
    "auth_required",
    "pds_unavailable",
    "invalid_request",
    "internal",
    "service_unavailable"
];
async function toPdsError(res) {
    let code = "unknown";
    try {
        const body = await res.clone().json();
        if (body?.error && KNOWN_CODES.includes(body.error)) {
            code = body.error;
        }
    } catch  {
    // non-JSON body — leave as "unknown"
    }
    if (res.status === 401) {
        code = "auth_required";
        if ("TURBOPACK compile-time truthy", 1) {
            window.dispatchEvent(new Event("poltr:session-expired"));
        }
    }
    const ra = res.headers.get("Retry-After");
    return {
        code,
        status: res.status,
        retryAfter: ra ? Number(ra) : undefined
    };
}
function isPdsError(e) {
    return typeof e === "object" && e !== null && "code" in e && "status" in e;
}
function pdsErrorKey(e) {
    const code = typeof e === "string" ? e : e.code;
    if (code === "auth_required") return "auth_required";
    if (code === "pds_unavailable" || code === "service_unavailable") return "pds_unavailable";
    if (code === "invalid_request") return "invalid_request";
    return "generic";
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/agent.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createAppPassword",
    ()=>createAppPassword,
    "createArgument",
    ()=>createArgument,
    "createComment",
    ()=>createComment,
    "getArgument",
    ()=>getArgument,
    "getBallot",
    ()=>getBallot,
    "getComment",
    ()=>getComment,
    "getPeerreviewCriteria",
    ()=>getPeerreviewCriteria,
    "getPeerreviewStatus",
    ()=>getPeerreviewStatus,
    "getPendingPeerreviews",
    ()=>getPendingPeerreviews,
    "getTaxonomy",
    ()=>getTaxonomy,
    "initiateEidVerification",
    ()=>initiateEidVerification,
    "listActivity",
    ()=>listActivity,
    "listArguments",
    ()=>listArguments,
    "listBallots",
    ()=>listBallots,
    "listComments",
    ()=>listComments,
    "markActivitySeen",
    ()=>markActivitySeen,
    "submitPeerreview",
    ()=>submitPeerreview
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/pdsError.ts [app-client] (ecmascript)");
;
/**
 * Get authenticated fetch handler that routes through Next.js API proxy.
 * The session cookie is sent automatically and forwarded as Bearer token by the proxy.
 * On 401 responses, dispatches a 'poltr:session-expired' event so the UI can react.
 */ function getAuthenticatedFetch() {
    return async (url, init)=>{
        const res = await fetch(url, {
            ...init,
            credentials: 'include'
        });
        if (res.status === 401 && ("TURBOPACK compile-time value", "object") !== 'undefined') {
            window.dispatchEvent(new Event('poltr:session-expired'));
        }
        return res;
    };
}
async function getBallot(rkey, lang) {
    const authenticatedFetch = getAuthenticatedFetch();
    const qs = lang ? `?lang=${encodeURIComponent(lang)}` : '';
    const res = await authenticatedFetch(`/api/poltr/ballots/${encodeURIComponent(rkey)}${qs}`);
    if (!res.ok) throw new Error(await res.text());
    const content = await res.json();
    if (!content?.ballot) {
        throw new Error('Invalid response from /api/poltr/ballots/<rkey>');
    }
    return content.ballot;
}
async function listBallots(lang) {
    const authenticatedFetch = getAuthenticatedFetch();
    const qs = lang ? `?lang=${encodeURIComponent(lang)}` : '';
    const res = await authenticatedFetch(`/api/poltr/ballots${qs}`);
    if (!res.ok) throw new Error(await res.text());
    const content = await res.json();
    if (!content?.ballots) {
        throw new Error('Invalid response from /api/poltr/ballots');
    }
    return content.ballots;
}
async function getArgument(ballotRkey, rkey) {
    const authenticatedFetch = getAuthenticatedFetch();
    const params = new URLSearchParams({
        ballot_rkey: ballotRkey,
        rkey
    });
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.argument.get?${params.toString()}`);
    if (!res.ok) throw new Error(await res.text());
    const content = await res.json();
    if (!content?.argument) {
        throw new Error('Invalid response from argument.get endpoint');
    }
    return content.argument;
}
async function listArguments(ballotRkey, sort, type, source) {
    const authenticatedFetch = getAuthenticatedFetch();
    const params = new URLSearchParams({
        ballot_rkey: ballotRkey
    });
    if (sort) params.set('sort', sort);
    if (type) params.set('type', type);
    if (source && source !== 'all') params.set('source', source);
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.argument.list?${params.toString()}`);
    if (!res.ok) throw new Error(await res.text());
    const content = await res.json();
    if (!content?.arguments) {
        throw new Error('Invalid response from argument.list endpoint');
    }
    return content.arguments;
}
async function getTaxonomy(ballotRkey, lang, topic, // 'full' = voller verschachtelter Baum (Sunburst); sonst Basis + 1 flache Ebene.
shape) {
    const authenticatedFetch = getAuthenticatedFetch();
    const params = new URLSearchParams({
        ballot_rkey: ballotRkey
    });
    if (lang) params.set('lang', lang);
    if (topic) params.set('topic', topic);
    if (shape) params.set('shape', shape);
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.taxonomy.get?${params.toString()}`);
    if (res.status === 404) return null; // noch keine Taxonomie für diesen Ballot
    if (!res.ok) throw new Error(await res.text());
    const content = await res.json();
    if (!content?.tree) throw new Error('Invalid response from taxonomy.get endpoint');
    return content;
}
async function createArgument(ballotRkey, title, body, type, langs) {
    const authenticatedFetch = getAuthenticatedFetch();
    const payload = {
        ballot: ballotRkey,
        title,
        body,
        type
    };
    if (langs && langs.length) payload.langs = langs;
    const res = await authenticatedFetch('/api/xrpc/app.ch.poltr.argument.create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toPdsError"])(res);
    return res.json();
}
async function getComment(uri) {
    const authenticatedFetch = getAuthenticatedFetch();
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.comment.get?uri=${encodeURIComponent(uri)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
async function listComments(argumentUri) {
    const authenticatedFetch = getAuthenticatedFetch();
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.comment.list?argument_uri=${encodeURIComponent(argumentUri)}`);
    if (!res.ok) throw new Error(await res.text());
    const content = await res.json();
    return content.comments ?? [];
}
async function createComment(argumentUri, title, body, parentUri, langs) {
    const authenticatedFetch = getAuthenticatedFetch();
    const payload = {
        argument: argumentUri,
        title,
        body
    };
    if (parentUri) payload.parent = parentUri;
    if (langs && langs.length) payload.langs = langs;
    const res = await authenticatedFetch('/api/xrpc/app.ch.poltr.comment.create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toPdsError"])(res);
    return res.json();
}
async function listActivity(ballotRkey, filter, cursor, limit = 30) {
    const authenticatedFetch = getAuthenticatedFetch();
    const params = new URLSearchParams({
        ballot_rkey: ballotRkey,
        limit: String(limit)
    });
    if (filter && filter !== 'all') params.set('filter', filter);
    if (cursor) params.set('cursor', cursor);
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.activity.list?${params.toString()}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
async function markActivitySeen(uris) {
    if (uris.length === 0) return;
    const authenticatedFetch = getAuthenticatedFetch();
    await authenticatedFetch('/api/xrpc/app.ch.poltr.activity.markSeen', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            uris
        })
    });
}
async function getPeerreviewCriteria() {
    const authenticatedFetch = getAuthenticatedFetch();
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.peerreview.criteria`);
    if (!res.ok) throw new Error(await res.text());
    const content = await res.json();
    return content.criteria;
}
async function getPendingPeerreviews() {
    const authenticatedFetch = getAuthenticatedFetch();
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.peerreview.pending`);
    if (!res.ok) throw new Error(await res.text());
    const content = await res.json();
    return content.invitations;
}
async function submitPeerreview(argumentUri, criteria, vote, justification) {
    const authenticatedFetch = getAuthenticatedFetch();
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.peerreview.submit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            argumentUri,
            criteria,
            vote,
            justification
        })
    });
    if (!res.ok) throw await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toPdsError"])(res);
    return res.json();
}
async function getPeerreviewStatus(argumentUri) {
    const authenticatedFetch = getAuthenticatedFetch();
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.peerreview.status?argumentUri=${encodeURIComponent(argumentUri)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
async function createAppPassword() {
    const authenticatedFetch = getAuthenticatedFetch();
    const res = await authenticatedFetch(`/api/xrpc/ch.poltr.auth.createAppPassword`, {
        method: 'POST'
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
async function initiateEidVerification() {
    const authenticatedFetch = getAuthenticatedFetch();
    const res = await authenticatedFetch(`/api/xrpc/ch.poltr.auth.initiateEidVerification`, {
        method: 'POST'
    });
    if (!res.ok) {
        const error = await res.json().catch(()=>({
                message: 'Unknown error'
            }));
        throw new Error(error.message || 'Failed to initiate verification');
    }
    return res.json();
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/overlay/url.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "entryKey",
    ()=>entryKey,
    "parseOverlayStack",
    ()=>parseOverlayStack,
    "serializeOverlayStack",
    ()=>serializeOverlayStack
]);
// URL-Schema: `?ov=<type>:<id>` — repeatable. Insertion-order = stack-order.
// Bottom of stack = first entry; visible top = last entry.
//
// IDs may contain `:` themselves (e.g. AT-URIs like `at://did:plc:abc/…`); we
// split on the FIRST colon only, so the rest is the raw id.
const PARAM = "ov";
function parseOverlayStack(searchParams) {
    const raw = searchParams.getAll(PARAM);
    const stack = [];
    for (const value of raw){
        const colon = value.indexOf(":");
        if (colon < 0) continue; // malformed entry — skip silently
        const type = value.slice(0, colon);
        const id = value.slice(colon + 1);
        if (!id) continue;
        if (type === "argument") stack.push({
            type: "argument",
            rkey: id
        });
        else if (type === "comment") stack.push({
            type: "comment",
            uri: id
        });
        else if (type === "profile") stack.push({
            type: "profile",
            did: id
        });
        else if (type === "peerreview") stack.push({
            type: "peerreview",
            id
        });
        else if (type === "taxonomy") {
            // id = `<ballotRkey>:<topic>` — beide ohne `:`, also am ersten splitten.
            const sep = id.indexOf(":");
            if (sep > 0) {
                stack.push({
                    type: "taxonomy",
                    ballotRkey: id.slice(0, sep),
                    topic: id.slice(sep + 1)
                });
            }
        }
    // unknown types are skipped — forward-compat with newer URLs from a newer
    // client. The visible top will simply be the last *known* entry.
    }
    return stack;
}
function serializeOverlayStack(stack) {
    const qp = new URLSearchParams();
    for (const entry of stack){
        qp.append(PARAM, serializeEntry(entry));
    }
    return qp.toString();
}
function serializeEntry(entry) {
    switch(entry.type){
        case "argument":
            return `argument:${entry.rkey}`;
        case "comment":
            return `comment:${entry.uri}`;
        case "profile":
            return `profile:${entry.did}`;
        case "peerreview":
            return `peerreview:${entry.id}`;
        case "taxonomy":
            return `taxonomy:${entry.ballotRkey}:${entry.topic}`;
    }
}
function entryKey(entry) {
    return serializeEntry(entry);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/overlay/context.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OverlayProvider",
    ()=>OverlayProvider,
    "useOverlayInternal",
    ()=>useOverlayInternal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$url$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay/url.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
;
const Ctx = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function useOverlayInternal() {
    _s();
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(Ctx);
    if (!ctx) {
        throw new Error("useOverlay must be used inside <OverlayProvider>");
    }
    return ctx;
}
_s(useOverlayInternal, "/dMy7t63NXD4eYACoT93CePwGrg=");
// ─── Anchor cache ──────────────────────────────────────────────────────────
//
// When the user clicks "into" something (e.g. a comment in the argument view),
// we save the clicked element's identifier as an "anchor" for the *current*
// URL. On return, we look up the anchor for the URL we just landed on and
// scroll the element with `[data-overlay-anchor="<value>"]` into view.
//
// We use sessionStorage (not `window.history.state`): Next.js' App Router
// overwrites custom keys on its internal `replaceState` calls during
// navigation. sessionStorage is independent.
const ANCHOR_STORE_KEY = "poltr.overlayAnchor.v1";
function readAnchorMap() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        return JSON.parse(window.sessionStorage.getItem(ANCHOR_STORE_KEY) ?? "{}");
    } catch  {
        return {};
    }
}
function writeAnchorMap(m) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        window.sessionStorage.setItem(ANCHOR_STORE_KEY, JSON.stringify(m));
    } catch  {
    // private mode / quota — silently no-op
    }
}
function saveAnchorFor(searchKey, anchor) {
    const m = readAnchorMap();
    m[searchKey] = anchor;
    writeAnchorMap(m);
}
function clearAnchorFor(searchKey) {
    const m = readAnchorMap();
    if (searchKey in m) {
        delete m[searchKey];
        writeAnchorMap(m);
    }
}
function clearAllAnchors() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        window.sessionStorage.removeItem(ANCHOR_STORE_KEY);
    } catch  {
    // ignore
    }
}
function readAnchorFor(searchKey) {
    return readAnchorMap()[searchKey] ?? null;
}
// How long we wait for the anchor element to appear after the detail component
// mounts. Detail pages load data async; the target element only enters the DOM
// once the fetch resolves. We watch for mutations and give up after this.
const ANCHOR_LOOKUP_TIMEOUT_MS = 5000;
// Iterate descendants with data-overlay-anchor and compare values via
// getAttribute. `querySelector` with an attribute selector + CSS.escape works
// in theory but is fragile for URIs containing `:` and `/` — iteration
// sidesteps escape concerns entirely.
function findAnchor(root, anchor) {
    const candidates = root.querySelectorAll("[data-overlay-anchor]");
    for (const el of Array.from(candidates)){
        if (el.getAttribute("data-overlay-anchor") === anchor) {
            return el;
        }
    }
    return null;
}
function scrollAnchorIntoView(root, anchor) {
    const initial = findAnchor(root, anchor);
    if (initial) {
        initial.scrollIntoView({
            block: "center"
        });
        return;
    }
    // Otherwise observe descendant mutations and retry until the target shows up
    // or we hit the timeout. Detail pages typically populate ~100-500ms after
    // mount once their fetches resolve.
    const observer = new MutationObserver(()=>{
        const target = findAnchor(root, anchor);
        if (target) {
            target.scrollIntoView({
                block: "center"
            });
            observer.disconnect();
            window.clearTimeout(timeoutId);
        }
    });
    observer.observe(root, {
        childList: true,
        subtree: true
    });
    const timeoutId = window.setTimeout(()=>{
        observer.disconnect();
    // Gave up — user stays at top of view.
    }, ANCHOR_LOOKUP_TIMEOUT_MS);
}
function OverlayProvider({ children }) {
    _s1();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const stack = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OverlayProvider.useMemo[stack]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$url$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["parseOverlayStack"])(searchParams)
    }["OverlayProvider.useMemo[stack]"], [
        searchParams
    ]);
    const top = stack[stack.length - 1] ?? null;
    const previousType = stack.length >= 2 ? stack[stack.length - 2].type : null;
    const willClose = stack.length <= 1;
    const pushCount = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const scrollEl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const pendingAnchor = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    // Keep the latest `stack` in a ref so the stable `navigate`/`back` callbacks
    // can read it without being recreated on every stack change.
    const stackRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(stack);
    stackRef.current = stack;
    const registerScrollContainer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OverlayProvider.useCallback[registerScrollContainer]": (el)=>{
            scrollEl.current = el;
            if (el && pendingAnchor.current !== null) {
                const anchor = pendingAnchor.current;
                pendingAnchor.current = null;
                scrollAnchorIntoView(el, anchor);
            }
        }
    }["OverlayProvider.useCallback[registerScrollContainer]"], []);
    const navigate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OverlayProvider.useCallback[navigate]": (entry, options)=>{
            const leavingKey = window.location.search;
            if (options?.anchor) {
                saveAnchorFor(leavingKey, options.anchor);
            } else {
                // No anchor on this hop — clear any stale entry so we don't accidentally
                // restore an anchor from a previous visit.
                clearAnchorFor(leavingKey);
            }
            pushCount.current += 1;
            const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$url$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["serializeOverlayStack"])([
                ...stackRef.current,
                entry
            ]);
            router.push(`?${next}`, {
                scroll: false
            });
        }
    }["OverlayProvider.useCallback[navigate]"], [
        router
    ]);
    const back = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OverlayProvider.useCallback[back]": ()=>{
            if (pushCount.current > 0) {
                router.back();
            } else {
                // Deep-link root: no in-session history-entry to pop. Peel one stack
                // level via replace so the user lands on the entry beneath.
                const newStack = stackRef.current.slice(0, -1);
                router.replace(newStack.length ? `?${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$url$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["serializeOverlayStack"])(newStack)}` : "?", {
                    scroll: false
                });
            }
        }
    }["OverlayProvider.useCallback[back]"], [
        router
    ]);
    const closeAll = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OverlayProvider.useCallback[closeAll]": ()=>{
            router.push("?", {
                scroll: false
            });
        }
    }["OverlayProvider.useCallback[closeAll]"], [
        router
    ]);
    // Anchor-restore on URL change. We watch `searchParams` rather than the
    // `popstate` event because Next.js' App Router `router.back()` updates the
    // URL via its internal subscription without firing `popstate`; watching
    // searchParams catches both router.back() *and* Browser-Back.
    const prevSearchRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OverlayProvider.useEffect": ()=>{
            const newSearch = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : window.location.search;
            const prev = prevSearchRef.current;
            prevSearchRef.current = newSearch;
            if (prev === null) return; // initial mount — no navigation yet
            if (prev === newSearch) return; // re-render without URL change
            const anchor = readAnchorFor(newSearch);
            if (anchor) {
                pendingAnchor.current = anchor;
            }
        }
    }["OverlayProvider.useEffect"], [
        searchParams
    ]);
    // Decrement pushCount when the stack shrinks (user navigated back via any
    // means). Wipe the anchor cache whenever the stack is empty — both on the
    // initial mount (defensive against anchors leftover in sessionStorage from a
    // previous overlay session in this tab) and when the user closes the overlay
    // (stack transitions back to 0). Otherwise anchors would accumulate forever.
    const prevStackLenRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(stack.length);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OverlayProvider.useEffect": ()=>{
            if (stack.length < prevStackLenRef.current) {
                pushCount.current = Math.max(0, pushCount.current - 1);
            }
            if (stack.length === 0) {
                clearAllAnchors();
            }
            prevStackLenRef.current = stack.length;
        }
    }["OverlayProvider.useEffect"], [
        stack.length
    ]);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OverlayProvider.useMemo[value]": ()=>({
                stack,
                top,
                previousType,
                willClose,
                navigate,
                back,
                closeAll,
                registerScrollContainer
            })
    }["OverlayProvider.useMemo[value]"], [
        stack,
        top,
        previousType,
        willClose,
        navigate,
        back,
        closeAll,
        registerScrollContainer
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Ctx.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/src/lib/overlay/context.tsx",
        lineNumber: 277,
        columnNumber: 10
    }, this);
}
_s1(OverlayProvider, "MGV3AGm+fKB1oJDST5ljom6yUIU=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSearchParams"]
    ];
});
_c = OverlayProvider;
var _c;
__turbopack_context__.k.register(_c, "OverlayProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ui/button.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Button",
    ()=>Button,
    "buttonVariants",
    ()=>buttonVariants
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-slot/dist/index.mjs [app-client] (ecmascript) <export * as Slot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
;
;
;
;
const buttonVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cva"])("inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", {
    variants: {
        variant: {
            default: "bg-primary text-primary-foreground hover:bg-primary/90",
            destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
            outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
            secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
            link: "text-primary underline-offset-4 hover:underline"
        },
        size: {
            default: "h-9 px-4 py-2 has-[>svg]:px-3",
            xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
            sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
            lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
            icon: "size-9",
            "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
            "icon-sm": "size-8",
            "icon-lg": "size-10"
        }
    },
    defaultVariants: {
        variant: "default",
        size: "default"
    }
});
function Button({ className, variant = "default", size = "default", asChild = false, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__["Slot"].Root : "button";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "button",
        "data-variant": variant,
        "data-size": size,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])(buttonVariants({
            variant,
            size,
            className
        })),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/button.tsx",
        lineNumber: 54,
        columnNumber: 5
    }, this);
}
_c = Button;
;
var _c;
__turbopack_context__.k.register(_c, "Button");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ui/dialog.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Dialog",
    ()=>Dialog,
    "DialogClose",
    ()=>DialogClose,
    "DialogContent",
    ()=>DialogContent,
    "DialogDescription",
    ()=>DialogDescription,
    "DialogFooter",
    ()=>DialogFooter,
    "DialogHeader",
    ()=>DialogHeader,
    "DialogOverlay",
    ()=>DialogOverlay,
    "DialogPortal",
    ()=>DialogPortal,
    "DialogTitle",
    ()=>DialogTitle,
    "DialogTrigger",
    ()=>DialogTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as XIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-dialog/dist/index.mjs [app-client] (ecmascript) <export * as Dialog>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/button.tsx [app-client] (ecmascript)");
"use client";
;
;
;
;
;
function Dialog({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Root, {
        "data-slot": "dialog",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 13,
        columnNumber: 10
    }, this);
}
_c = Dialog;
function DialogTrigger({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Trigger, {
        "data-slot": "dialog-trigger",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 19,
        columnNumber: 10
    }, this);
}
_c1 = DialogTrigger;
function DialogPortal({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Portal, {
        "data-slot": "dialog-portal",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 25,
        columnNumber: 10
    }, this);
}
_c2 = DialogPortal;
function DialogClose({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Close, {
        "data-slot": "dialog-close",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 31,
        columnNumber: 10
    }, this);
}
_c3 = DialogClose;
function DialogOverlay({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Overlay, {
        "data-slot": "dialog-overlay",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("fixed inset-0 z-50 bg-[#241d14]/55 backdrop-blur-[6px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 39,
        columnNumber: 5
    }, this);
}
_c4 = DialogOverlay;
function DialogContent({ className, children, showCloseButton = true, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DialogPortal, {
        "data-slot": "dialog-portal",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DialogOverlay, {}, void 0, false, {
                fileName: "[project]/src/components/ui/dialog.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Content, {
                "data-slot": "dialog-content",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg", className),
                ...props,
                children: [
                    children,
                    showCloseButton && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Close, {
                        "data-slot": "dialog-close",
                        className: "absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XIcon$3e$__["XIcon"], {}, void 0, false, {
                                fileName: "[project]/src/components/ui/dialog.tsx",
                                lineNumber: 75,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "sr-only",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/src/components/ui/dialog.tsx",
                                lineNumber: 76,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/ui/dialog.tsx",
                        lineNumber: 71,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ui/dialog.tsx",
                lineNumber: 61,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 59,
        columnNumber: 5
    }, this);
}
_c5 = DialogContent;
function DialogHeader({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "dialog-header",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col gap-2 text-center sm:text-left", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 86,
        columnNumber: 5
    }, this);
}
_c6 = DialogHeader;
function DialogFooter({ className, showCloseButton = false, children, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "dialog-footer",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className),
        ...props,
        children: [
            children,
            showCloseButton && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Close, {
                asChild: true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                    variant: "outline",
                    children: "Close"
                }, void 0, false, {
                    fileName: "[project]/src/components/ui/dialog.tsx",
                    lineNumber: 114,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/ui/dialog.tsx",
                lineNumber: 113,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 103,
        columnNumber: 5
    }, this);
}
_c7 = DialogFooter;
function DialogTitle({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Title, {
        "data-slot": "dialog-title",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-lg leading-none font-semibold", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 126,
        columnNumber: 5
    }, this);
}
_c8 = DialogTitle;
function DialogDescription({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Dialog$3e$__["Dialog"].Description, {
        "data-slot": "dialog-description",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-sm text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 139,
        columnNumber: 5
    }, this);
}
_c9 = DialogDescription;
;
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9;
__turbopack_context__.k.register(_c, "Dialog");
__turbopack_context__.k.register(_c1, "DialogTrigger");
__turbopack_context__.k.register(_c2, "DialogPortal");
__turbopack_context__.k.register(_c3, "DialogClose");
__turbopack_context__.k.register(_c4, "DialogOverlay");
__turbopack_context__.k.register(_c5, "DialogContent");
__turbopack_context__.k.register(_c6, "DialogHeader");
__turbopack_context__.k.register(_c7, "DialogFooter");
__turbopack_context__.k.register(_c8, "DialogTitle");
__turbopack_context__.k.register(_c9, "DialogDescription");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/overlay/use-overlay.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useOverlay",
    ()=>useOverlay
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay/context.tsx [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
;
function useOverlay() {
    _s();
    const ctx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOverlayInternal"])();
    return {
        stack: ctx.stack,
        top: ctx.top,
        previousType: ctx.previousType,
        willClose: ctx.willClose,
        navigate: ctx.navigate,
        back: ctx.back,
        closeAll: ctx.closeAll,
        registerScrollContainer: ctx.registerScrollContainer
    };
}
_s(useOverlay, "v26wywEuupWIMAaWHK0jCLNrSnE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOverlayInternal"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/overlay/overlay-host.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OverlayHost",
    ()=>OverlayHost
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/dialog.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$use$2d$overlay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay/use-overlay.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
// Radix-Dialog plays a ~200ms close animation. If we clear the rendered entry
// the instant `top` becomes null, the user sees the dialog fade out empty.
// Keep the last-rendered entry around for this long so content fades with the
// dialog chrome. Switching to a new entry is immediate (no linger).
const CLOSE_ANIMATION_MS = 350;
function OverlayHost({ children, closeLabel, backLabels, titles, className }) {
    _s();
    const { top, previousType, willClose, back, closeAll, navigate, registerScrollContainer } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$use$2d$overlay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOverlay"])();
    // Back label is derived purely from the stack: the type *underneath* the
    // visible top tells the user where they'll land. No URL-shape heuristics.
    const backLabel = willClose ? closeLabel : (previousType && backLabels[previousType]) ?? closeLabel;
    // Linger-rendered entry: tracks `top` immediately on open/navigate, but
    // delays clearing for the duration of the dialog's close animation.
    const [rendered, setRendered] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(top);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OverlayHost.useEffect": ()=>{
            if (top) {
                setRendered(top);
                return;
            }
            const id = setTimeout({
                "OverlayHost.useEffect.id": ()=>setRendered(null)
            }["OverlayHost.useEffect.id"], CLOSE_ANIMATION_MS);
            return ({
                "OverlayHost.useEffect": ()=>clearTimeout(id)
            })["OverlayHost.useEffect"];
        }
    }["OverlayHost.useEffect"], [
        top
    ]);
    const ctx = {
        back,
        backLabel,
        navigate,
        registerScrollContainer
    };
    const srTitle = (rendered && titles[rendered.type]) ?? closeLabel;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dialog"], {
        open: !!top,
        onOpenChange: (open)=>{
            if (!open) closeAll();
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogContent"], {
            showCloseButton: false,
            // Opt out of aria-describedby: there is no meaningful single-sentence
            // description per overlay entry. The DialogTitle below + the rendered
            // detail content carry the semantics for screen readers.
            "aria-describedby": undefined,
            className: className ?? "sm:max-w-4xl w-full h-[92vh] p-0 bg-transparent border-0 shadow-none",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTitle"], {
                    className: "sr-only",
                    children: srTitle
                }, void 0, false, {
                    fileName: "[project]/src/lib/overlay/overlay-host.tsx",
                    lineNumber: 93,
                    columnNumber: 9
                }, this),
                rendered && children(rendered, ctx)
            ]
        }, void 0, true, {
            fileName: "[project]/src/lib/overlay/overlay-host.tsx",
            lineNumber: 82,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/lib/overlay/overlay-host.tsx",
        lineNumber: 76,
        columnNumber: 5
    }, this);
}
_s(OverlayHost, "d6LYRiuTKIVYwZ6K4Gpiuf8VACs=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$use$2d$overlay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOverlay"]
    ];
});
_c = OverlayHost;
var _c;
__turbopack_context__.k.register(_c, "OverlayHost");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/overlay/index.ts [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay/context.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$overlay$2d$host$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay/overlay-host.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$use$2d$overlay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay/use-overlay.ts [app-client] (ecmascript)");
;
;
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/commentThread.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "authorName",
    ()=>authorName,
    "buildAncestorChain",
    ()=>buildAncestorChain,
    "buildCommentMap",
    ()=>buildCommentMap,
    "rootComments",
    ()=>rootComments
]);
function authorName(comment, tc) {
    if (comment.origin === "extern") {
        return comment.author.handle || comment.author.displayName || tc("bluesky");
    }
    return comment.author.displayName || tc("anonymous");
}
function buildCommentMap(comments, extra) {
    const source = extra && !comments.some((c)=>c.uri === extra.uri) ? [
        ...comments,
        extra
    ] : comments;
    const map = new Map();
    for (const c of source)map.set(c.uri, {
        ...c,
        replies: []
    });
    for (const c of source){
        if (c.parentUri && map.has(c.parentUri)) {
            map.get(c.parentUri).replies.push(map.get(c.uri));
        }
    }
    return map;
}
function rootComments(comments, map) {
    return comments.filter((c)=>!c.parentUri).map((c)=>map.get(c.uri));
}
function buildAncestorChain(map, focalUri) {
    const chain = [];
    let current = map.get(focalUri);
    while(current?.parentUri){
        const parent = map.get(current.parentUri);
        if (!parent) break;
        chain.unshift(parent);
        current = parent;
    }
    return chain;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/ballots.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "likeBallot",
    ()=>likeBallot,
    "likeContent",
    ()=>likeContent,
    "rateContent",
    ()=>rateContent,
    "unlikeBallot",
    ()=>unlikeBallot,
    "unlikeContent",
    ()=>unlikeContent
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/pdsError.ts [app-client] (ecmascript)");
;
async function likeBallot(subjectUri, subjectCid) {
    const res = await fetch('/api/xrpc/app.ch.poltr.content.rating', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            subject: {
                uri: subjectUri,
                cid: subjectCid
            }
        })
    });
    if (!res.ok) throw await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toPdsError"])(res);
    const data = await res.json();
    return data.uri;
}
const likeContent = likeBallot;
async function rateContent(subjectUri, subjectCid, preference) {
    const res = await fetch('/api/xrpc/app.ch.poltr.content.rating', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            subject: {
                uri: subjectUri,
                cid: subjectCid
            },
            preference
        })
    });
    if (!res.ok) throw await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toPdsError"])(res);
    const data = await res.json();
    return data.uri;
}
async function unlikeBallot(likeUri) {
    const res = await fetch('/api/xrpc/app.ch.poltr.content.unrating', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            likeUri
        })
    });
    if (!res.ok) throw await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toPdsError"])(res);
}
const unlikeContent = unlikeBallot;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/queries/comments.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "commentKeys",
    ()=>commentKeys,
    "useCommentsQuery",
    ()=>useCommentsQuery
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
const commentKeys = {
    list: (argumentUri)=>[
            "comments",
            argumentUri
        ]
};
function useCommentsQuery(argumentUri) {
    _s();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: commentKeys.list(argumentUri ?? "__none__"),
        queryFn: {
            "useCommentsQuery.useQuery": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["listComments"])(argumentUri)
        }["useCommentsQuery.useQuery"],
        enabled: !!argumentUri
    });
}
_s(useCommentsQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/useCommentThread.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useCommentThread",
    ()=>useCommentThread
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ballots$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/ballots.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$comments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/queries/comments.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/pdsError.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
const asPdsError = (e)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isPdsError"])(e) ? e : {
        code: "unknown",
        status: 0
    };
function useCommentThread(argumentUri, options) {
    _s();
    const qc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"])();
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"])();
    const onError = options?.onError;
    const query = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$comments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCommentsQuery"])(argumentUri);
    const comments = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "useCommentThread.useMemo[comments]": ()=>query.data ?? []
    }["useCommentThread.useMemo[comments]"], [
        query.data
    ]);
    // Last comment-submit failure, for an inline alert in the composer
    // (the typed text is preserved). Cleared on a new attempt / success.
    const [commentError, setCommentError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    // Composer: replyText, submit-in-flight, and the uri the composer targets.
    // `replyTarget` semantics are owned by the caller (a comment uri, or a
    // page-specific sentinel for the top-level composer).
    const [replyText, setReplyText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [submitting, setSubmitting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [replyTarget, setReplyTarget] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const replyInputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    // Focus the textarea whenever the composer opens.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useCommentThread.useEffect": ()=>{
            if (replyTarget) replyInputRef.current?.focus();
        }
    }["useCommentThread.useEffect"], [
        replyTarget
    ]);
    // Patch a single comment in the cached flat list.
    const patchComment = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useCommentThread.useCallback[patchComment]": (uri, patch)=>{
            if (!argumentUri) return;
            qc.setQueryData(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$comments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["commentKeys"].list(argumentUri), {
                "useCommentThread.useCallback[patchComment]": (prev)=>prev?.map({
                        "useCommentThread.useCallback[patchComment]": (c)=>c.uri === uri ? {
                                ...c,
                                ...patch
                            } : c
                    }["useCommentThread.useCallback[patchComment]"])
            }["useCommentThread.useCallback[patchComment]"]);
        }
    }["useCommentThread.useCallback[patchComment]"], [
        qc,
        argumentUri
    ]);
    /** Optimistically toggle a like with rollback on failure. */ const toggleLike = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useCommentThread.useCallback[toggleLike]": async (c)=>{
            const liked = !!c.viewer?.like;
            patchComment(c.uri, {
                likeCount: (c.likeCount ?? 0) + (liked ? -1 : 1),
                viewer: liked ? undefined : {
                    like: "__pending__"
                }
            });
            try {
                if (liked) {
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ballots$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unlikeContent"])(c.viewer.like);
                    patchComment(c.uri, {
                        viewer: undefined
                    });
                } else {
                    const likeUri = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ballots$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["likeContent"])(c.uri, c.cid);
                    patchComment(c.uri, {
                        viewer: {
                            like: likeUri
                        }
                    });
                }
            } catch (err) {
                patchComment(c.uri, {
                    likeCount: c.likeCount ?? 0,
                    viewer: c.viewer
                });
                onError?.(asPdsError(err));
            }
        }
    }["useCommentThread.useCallback[toggleLike]"], [
        patchComment,
        onError
    ]);
    /**
   * Submit the composer text as a comment on `argumentUri`, optionally as a
   * reply to `parentUri`. Invalidates the list (→ refetch) and closes the
   * composer on success.
   */ const submitComment = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useCommentThread.useCallback[submitComment]": async (argUri, parentUri)=>{
            if (!replyText.trim() || submitting) return;
            setSubmitting(true);
            setCommentError(null);
            try {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createComment"])(argUri, "", replyText.trim(), parentUri, [
                    locale
                ]);
                setReplyText("");
                await qc.invalidateQueries({
                    queryKey: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$comments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["commentKeys"].list(argUri)
                });
                setReplyTarget(null);
            } catch (err) {
                // Keep the typed text; surface an inline error in the composer.
                setCommentError(asPdsError(err));
            } finally{
                setSubmitting(false);
            }
        }
    }["useCommentThread.useCallback[submitComment]"], [
        replyText,
        submitting,
        qc,
        locale
    ]);
    return {
        comments,
        // true while the list is loading for a known argument (idle when disabled).
        commentsLoading: !!argumentUri && query.isPending,
        toggleLike,
        submitComment,
        // composer
        replyText,
        setReplyText,
        submitting,
        replyTarget,
        setReplyTarget,
        replyInputRef,
        commentError,
        setCommentError
    };
}
_s(useCommentThread, "CYfIKHXsvsx8qapOosjvVRjOLjE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$comments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCommentsQuery"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ui/separator.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Separator",
    ()=>Separator
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$separator$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Separator$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-separator/dist/index.mjs [app-client] (ecmascript) <export * as Separator>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
"use client";
;
;
;
function Separator({ className, orientation = "horizontal", decorative = true, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$separator$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Separator$3e$__["Separator"].Root, {
        "data-slot": "separator",
        decorative: decorative,
        orientation: orientation,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/separator.tsx",
        lineNumber: 15,
        columnNumber: 5
    }, this);
}
_c = Separator;
;
var _c;
__turbopack_context__.k.register(_c, "Separator");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ui/alert.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Alert",
    ()=>Alert,
    "AlertDescription",
    ()=>AlertDescription,
    "AlertTitle",
    ()=>AlertTitle
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
;
;
;
const alertVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cva"])("relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current", {
    variants: {
        variant: {
            default: "bg-card text-card-foreground",
            destructive: "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current"
        }
    },
    defaultVariants: {
        variant: "default"
    }
});
function Alert({ className, variant, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "alert",
        role: "alert",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])(alertVariants({
            variant
        }), className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert.tsx",
        lineNumber: 28,
        columnNumber: 5
    }, this);
}
_c = Alert;
function AlertTitle({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "alert-title",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert.tsx",
        lineNumber: 39,
        columnNumber: 5
    }, this);
}
_c1 = AlertTitle;
function AlertDescription({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "alert-description",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert.tsx",
        lineNumber: 55,
        columnNumber: 5
    }, this);
}
_c2 = AlertDescription;
;
var _c, _c1, _c2;
__turbopack_context__.k.register(_c, "Alert");
__turbopack_context__.k.register(_c1, "AlertTitle");
__turbopack_context__.k.register(_c2, "AlertDescription");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ui/badge.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Badge",
    ()=>Badge,
    "badgeVariants",
    ()=>badgeVariants
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-slot/dist/index.mjs [app-client] (ecmascript) <export * as Slot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
;
;
;
;
const badgeVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cva"])("inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3", {
    variants: {
        variant: {
            default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
            secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
            destructive: "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
            outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
            ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
            link: "text-primary underline-offset-4 [a&]:hover:underline"
        }
    },
    defaultVariants: {
        variant: "default"
    }
});
function Badge({ className, variant = "default", asChild = false, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slot$3e$__["Slot"].Root : "span";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "badge",
        "data-variant": variant,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])(badgeVariants({
            variant
        }), className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/badge.tsx",
        lineNumber: 39,
        columnNumber: 5
    }, this);
}
_c = Badge;
;
var _c;
__turbopack_context__.k.register(_c, "Badge");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/pro-contra-badge.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OfficialBadge",
    ()=>OfficialBadge,
    "OfficialStar",
    ()=>OfficialStar,
    "PeerreviewStatusBadge",
    ()=>PeerreviewStatusBadge,
    "ProContraBadge",
    ()=>ProContraBadge,
    "isOfficialArgument",
    ()=>isOfficialArgument
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/badge.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature(), _s3 = __turbopack_context__.k.signature();
;
;
function ProContraBadge({ type, variant = "solid" }) {
    _s();
    const tc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('common');
    if (!type) return null;
    const isPro = type === "pro";
    if (variant === "soft") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
            className: "text-xs font-semibold",
            style: {
                backgroundColor: isPro ? 'var(--pro-dim)' : 'var(--contra-dim)',
                color: isPro ? 'var(--pro)' : 'var(--contra)'
            },
            children: isPro ? tc('pro') : tc('contra')
        }, void 0, false, {
            fileName: "[project]/src/components/pro-contra-badge.tsx",
            lineNumber: 11,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
        className: "text-xs font-bold text-white",
        style: {
            backgroundColor: isPro ? 'var(--pro)' : 'var(--contra)'
        },
        children: isPro ? tc('pro') : tc('contra')
    }, void 0, false, {
        fileName: "[project]/src/components/pro-contra-badge.tsx",
        lineNumber: 24,
        columnNumber: 5
    }, this);
}
_s(ProContraBadge, "F6XHUGJHwar362l4a3QmyWpZGVo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = ProContraBadge;
const OFFICIAL_SOURCE = "app.ch.poltr.ballot.argument#sourceOfficial";
function isOfficialArgument(source) {
    return source?.$type === OFFICIAL_SOURCE;
}
function OfficialStar() {
    _s1();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('reviewStatus');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: "ml-1 align-baseline text-amber-500",
        role: "img",
        "aria-label": t('official'),
        children: "★"
    }, void 0, false, {
        fileName: "[project]/src/components/pro-contra-badge.tsx",
        lineNumber: 47,
        columnNumber: 5
    }, this);
}
_s1(OfficialStar, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c1 = OfficialStar;
function OfficialBadge() {
    _s2();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('reviewStatus');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
        variant: "outline",
        className: "text-xs bg-amber-50 text-amber-800 border-0",
        children: [
            "★ ",
            t('official')
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/pro-contra-badge.tsx",
        lineNumber: 60,
        columnNumber: 5
    }, this);
}
_s2(OfficialBadge, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c2 = OfficialBadge;
function PeerreviewStatusBadge({ status }) {
    _s3();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('reviewStatus');
    if (!status) return null;
    const config = {
        preliminary: {
            bg: 'bg-orange-50',
            text: 'text-orange-800',
            key: 'preliminary'
        },
        approved: {
            bg: 'bg-green-50',
            text: 'text-green-800',
            key: 'peerReviewed'
        },
        rejected: {
            bg: 'bg-red-50',
            text: 'text-red-800',
            key: 'rejected'
        }
    };
    const c = config[status];
    if (!c) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
        variant: "outline",
        className: `text-xs ${c.bg} ${c.text} border-0`,
        children: t(c.key)
    }, void 0, false, {
        fileName: "[project]/src/components/pro-contra-badge.tsx",
        lineNumber: 80,
        columnNumber: 5
    }, this);
}
_s3(PeerreviewStatusBadge, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c3 = PeerreviewStatusBadge;
var _c, _c1, _c2, _c3;
__turbopack_context__.k.register(_c, "ProContraBadge");
__turbopack_context__.k.register(_c1, "OfficialStar");
__turbopack_context__.k.register(_c2, "OfficialBadge");
__turbopack_context__.k.register(_c3, "PeerreviewStatusBadge");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/canton-avatar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BskyAvatar",
    ()=>BskyAvatar,
    "CantonAvatar",
    ()=>CantonAvatar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
function CantonAvatar({ canton, color, size = 32 }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center justify-center text-white font-bold leading-none",
        style: {
            width: size,
            height: size,
            minWidth: size,
            borderRadius: 4,
            backgroundColor: color || '#90a4ae',
            fontSize: size * 0.4
        },
        children: canton ? canton.toUpperCase() : '?'
    }, void 0, false, {
        fileName: "[project]/src/components/canton-avatar.tsx",
        lineNumber: 3,
        columnNumber: 5
    }, this);
}
_c = CantonAvatar;
function BskyAvatar({ size = 28 }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center justify-center text-white leading-none",
        style: {
            width: size,
            height: size,
            minWidth: size,
            borderRadius: 4,
            backgroundColor: '#1185fe',
            fontSize: size * 0.55
        },
        children: '\ud83e\udd8b'
    }, void 0, false, {
        fileName: "[project]/src/components/canton-avatar.tsx",
        lineNumber: 18,
        columnNumber: 5
    }, this);
}
_c1 = BskyAvatar;
var _c, _c1;
__turbopack_context__.k.register(_c, "CantonAvatar");
__turbopack_context__.k.register(_c1, "BskyAvatar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/comment-content.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CommentAvatar",
    ()=>CommentAvatar,
    "CommentContent",
    ()=>CommentContent
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$commentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/commentThread.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$canton$2d$avatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/canton-avatar.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function CommentAvatar({ comment, size = 28 }) {
    return comment.origin === "extern" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$canton$2d$avatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BskyAvatar"], {
        size: size
    }, void 0, false, {
        fileName: "[project]/src/components/comment-content.tsx",
        lineNumber: 19,
        columnNumber: 5
    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$canton$2d$avatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CantonAvatar"], {
        canton: comment.author.canton,
        color: comment.author.color,
        size: size
    }, void 0, false, {
        fileName: "[project]/src/components/comment-content.tsx",
        lineNumber: 21,
        columnNumber: 5
    }, this);
}
_c = CommentAvatar;
function CommentContent({ comment, focal = false, clamp = false, onLikeToggle, onReply }) {
    _s();
    const tc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("common");
    const isExtern = comment.origin === "extern";
    const liked = !!comment.viewer?.like;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-semibold text-foreground",
                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$commentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["authorName"])(comment, tc)
                    }, void 0, false, {
                        fileName: "[project]/src/components/comment-content.tsx",
                        lineNumber: 54,
                        columnNumber: 9
                    }, this),
                    isExtern && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                        variant: "secondary",
                        className: "text-[0.6875rem] px-1.5 py-0",
                        children: tc("bluesky")
                    }, void 0, false, {
                        fileName: "[project]/src/components/comment-content.tsx",
                        lineNumber: 58,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: comment.record.createdAt ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatRelativeTime"])(comment.record.createdAt) : ""
                    }, void 0, false, {
                        fileName: "[project]/src/components/comment-content.tsx",
                        lineNumber: 62,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/comment-content.tsx",
                lineNumber: 53,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("leading-normal mt-0.5", focal ? "text-base" : "text-sm", clamp && "line-clamp-4"),
                children: comment.record.body
            }, void 0, false, {
                fileName: "[project]/src/components/comment-content.tsx",
                lineNumber: 69,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex gap-4 mt-1.5 text-xs text-muted-foreground",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: (e)=>{
                            e.stopPropagation();
                            onLikeToggle?.(comment);
                        },
                        className: "bg-transparent border-none p-0 cursor-pointer text-xs",
                        style: {
                            color: liked ? "var(--brand)" : "#8e8e8e"
                        },
                        children: [
                            liked ? "❤" : "♡",
                            " ",
                            (comment.likeCount ?? 0) > 0 ? comment.likeCount : ""
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/comment-content.tsx",
                        lineNumber: 80,
                        columnNumber: 9
                    }, this),
                    !isExtern && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: (e)=>{
                            e.stopPropagation();
                            onReply?.(comment.uri);
                        },
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("bg-transparent border-none p-0 cursor-pointer text-xs", focal ? "text-primary font-semibold" : "text-muted-foreground"),
                        children: [
                            "💬",
                            " ",
                            tc("reply")
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/comment-content.tsx",
                        lineNumber: 92,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/comment-content.tsx",
                lineNumber: 79,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
_s(CommentContent, "F6XHUGJHwar362l4a3QmyWpZGVo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c1 = CommentContent;
var _c, _c1;
__turbopack_context__.k.register(_c, "CommentAvatar");
__turbopack_context__.k.register(_c1, "CommentContent");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ui/textarea.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Textarea",
    ()=>Textarea
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
;
;
function Textarea({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
        "data-slot": "textarea",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/textarea.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
_c = Textarea;
;
var _c;
__turbopack_context__.k.register(_c, "Textarea");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/reply-input.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ReplyInput",
    ()=>ReplyInput
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$textarea$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/textarea.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
const ReplyInput = /*#__PURE__*/ _s((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"])(_c = _s(function ReplyInput({ value, onChange, onSubmit, submitting, placeholder, onCancel }, ref) {
    _s();
    const [focused, setFocused] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const tc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('common');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex gap-2 items-end py-1.5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$textarea$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Textarea"], {
                ref: ref,
                rows: focused ? 3 : 1,
                value: value,
                onChange: (e)=>onChange(e.target.value),
                onFocus: ()=>setFocused(true),
                onBlur: ()=>{
                    if (!value) setFocused(false);
                },
                placeholder: placeholder,
                className: "flex-1 text-xs resize-none",
                onKeyDown: (e)=>{
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onSubmit();
                    } else if (e.key === 'Escape' && onCancel) {
                        e.preventDefault();
                        onCancel();
                    }
                }
            }, void 0, false, {
                fileName: "[project]/src/components/reply-input.tsx",
                lineNumber: 21,
                columnNumber: 7
            }, this),
            onCancel && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                size: "sm",
                variant: "ghost",
                onMouseDown: (e)=>e.preventDefault(),
                onClick: onCancel,
                children: tc('cancel')
            }, void 0, false, {
                fileName: "[project]/src/components/reply-input.tsx",
                lineNumber: 36,
                columnNumber: 9
            }, this),
            (focused || value) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                size: "sm",
                onMouseDown: (e)=>e.preventDefault(),
                onClick: onSubmit,
                disabled: !value.trim() || submitting,
                children: submitting ? tc('submitting') : tc('send')
            }, void 0, false, {
                fileName: "[project]/src/components/reply-input.tsx",
                lineNumber: 46,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/reply-input.tsx",
        lineNumber: 20,
        columnNumber: 5
    }, this);
}, "Jiscg4yNqBhFBWoSJ8XimdhQ4Os=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
})), "Jiscg4yNqBhFBWoSJ8XimdhQ4Os=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c1 = ReplyInput;
var _c, _c1;
__turbopack_context__.k.register(_c, "ReplyInput$forwardRef");
__turbopack_context__.k.register(_c1, "ReplyInput");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ui/slider.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Slider",
    ()=>Slider
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slider$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slider$3e$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-slider/dist/index.mjs [app-client] (ecmascript) <export * as Slider>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
function Slider({ className, defaultValue, value, min = 0, max = 100, ...props }) {
    _s();
    const _values = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"]({
        "Slider.useMemo[_values]": ()=>Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [
                min,
                max
            ]
    }["Slider.useMemo[_values]"], [
        value,
        defaultValue,
        min,
        max
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slider$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slider$3e$__["Slider"].Root, {
        "data-slot": "slider",
        defaultValue: defaultValue,
        value: value,
        min: min,
        max: max,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col", className),
        ...props,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slider$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slider$3e$__["Slider"].Track, {
                "data-slot": "slider-track",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slider$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slider$3e$__["Slider"].Range, {
                    "data-slot": "slider-range",
                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full")
                }, void 0, false, {
                    fileName: "[project]/src/components/ui/slider.tsx",
                    lineNumber: 45,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/ui/slider.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this),
            Array.from({
                length: _values.length
            }, (_, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slider$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Slider$3e$__["Slider"].Thumb, {
                    "data-slot": "slider-thumb",
                    className: "block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
                }, index, false, {
                    fileName: "[project]/src/components/ui/slider.tsx",
                    lineNumber: 53,
                    columnNumber: 9
                }, this))
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ui/slider.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, this);
}
_s(Slider, "g0y/PG/feYg861SE8jxuAUMRVc0=");
_c = Slider;
;
var _c;
__turbopack_context__.k.register(_c, "Slider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/relevance-rating.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "RelevanceRating",
    ()=>RelevanceRating,
    "relevanceLevel",
    ()=>relevanceLevel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$styled$2d$jsx$2f$style$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/styled-jsx/style.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$minus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Minus$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/minus.js [app-client] (ecmascript) <export default as Minus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/plus.js [app-client] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$slider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/slider.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function relevanceLevel(value) {
    if (value <= 30) return "low";
    if (value <= 60) return "medium";
    return "high";
}
const clamp = (v)=>Math.min(100, Math.max(1, Math.round(v)));
function RelevanceRating({ value, onChange, onCommit, showIntro = true, accent = "pro" }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("relevance");
    const rated = value !== null;
    // Unbewertet: Regler steht neutral in der Mitte, ohne Wert anzuzeigen.
    const display = value ?? 50;
    const level = relevanceLevel(display);
    const label = !rated ? t("notRated") : level === "low" ? t("low") : level === "medium" ? t("medium") : t("high");
    // Horizontale Position der Pille = Position des Reglerknopfes (1 → 0 %, 100 → 100 %).
    const pct = (display - 1) / 99 * 100;
    // Farbkonzept = Argumentfarbe. Per Inline-Style gesetzt (statt gescopter Klasse),
    // damit die Custom Properties zuverlässig in den Radix-Slider hineinvererben.
    const accentStyle = {
        "--rng-accent": accent === "contra" ? "var(--contra)" : "var(--pro)",
        "--rng-deep": accent === "contra" ? "#76301f" : "#2c5a41"
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: accentStyle,
        className: "jsx-66aa90066b389d3c" + " " + "na-rating",
        children: [
            showIntro && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "jsx-66aa90066b389d3c" + " " + "na-rating-intro",
                children: t("intro")
            }, void 0, false, {
                fileName: "[project]/src/components/relevance-rating.tsx",
                lineNumber: 63,
                columnNumber: 21
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "jsx-66aa90066b389d3c" + " " + "na-rating-control",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        "aria-label": t("decrease"),
                        onClick: ()=>{
                            const next = clamp(display - 1);
                            onChange(next);
                            onCommit?.(next);
                        },
                        className: "jsx-66aa90066b389d3c" + " " + "na-rating-step",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$minus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Minus$3e$__["Minus"], {
                            size: 16,
                            strokeWidth: 2.5
                        }, void 0, false, {
                            fileName: "[project]/src/components/relevance-rating.tsx",
                            lineNumber: 76,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/relevance-rating.tsx",
                        lineNumber: 66,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "jsx-66aa90066b389d3c" + " " + "na-rating-track-wrap",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    left: `${pct}%`
                                },
                                "aria-hidden": "true",
                                className: "jsx-66aa90066b389d3c" + " " + `na-rating-pill${rated ? "" : " na-rating-pill-unrated"}`,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "jsx-66aa90066b389d3c" + " " + "na-rating-label",
                                        children: label
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/relevance-rating.tsx",
                                        lineNumber: 85,
                                        columnNumber: 13
                                    }, this),
                                    rated && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "jsx-66aa90066b389d3c" + " " + "na-rating-sep",
                                                children: "|"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/relevance-rating.tsx",
                                                lineNumber: 88,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "jsx-66aa90066b389d3c" + " " + "na-rating-value",
                                                children: display
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/relevance-rating.tsx",
                                                lineNumber: 89,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/relevance-rating.tsx",
                                lineNumber: 80,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$slider$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Slider"], {
                                className: `na-rating-slider${rated ? "" : " na-rating-slider-unrated"}`,
                                min: 1,
                                max: 100,
                                step: 1,
                                value: [
                                    display
                                ],
                                onValueChange: (v)=>onChange(clamp(v[0])),
                                onValueCommit: (v)=>onCommit?.(clamp(v[0])),
                                "aria-label": t("ariaLabel")
                            }, void 0, false, {
                                fileName: "[project]/src/components/relevance-rating.tsx",
                                lineNumber: 93,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/relevance-rating.tsx",
                        lineNumber: 79,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        "aria-label": t("increase"),
                        onClick: ()=>{
                            const next = clamp(display + 1);
                            onChange(next);
                            onCommit?.(next);
                        },
                        className: "jsx-66aa90066b389d3c" + " " + "na-rating-step",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                            size: 16,
                            strokeWidth: 2.5
                        }, void 0, false, {
                            fileName: "[project]/src/components/relevance-rating.tsx",
                            lineNumber: 115,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/relevance-rating.tsx",
                        lineNumber: 105,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/relevance-rating.tsx",
                lineNumber: 65,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$styled$2d$jsx$2f$style$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                id: "66aa90066b389d3c",
                children: '.na-rating.jsx-66aa90066b389d3c{width:100%}.na-rating-intro.jsx-66aa90066b389d3c{color:var(--text-mid,#555);margin:0 0 14px;font-size:.875rem;line-height:1.5}.na-rating-control.jsx-66aa90066b389d3c{align-items:center;gap:14px;max-width:440px;margin-top:40px;margin-left:auto;margin-right:auto;display:flex}.na-rating-step.jsx-66aa90066b389d3c{border:1px solid var(--line,#e0ded9);width:30px;height:30px;color:var(--text-mid,#555);cursor:pointer;background:0 0;border-radius:50%;flex-shrink:0;justify-content:center;align-items:center;transition:background .15s,border-color .15s,color .15s;display:inline-flex}.na-rating-step.jsx-66aa90066b389d3c:hover{border-color:var(--line-mid,#c9c6bf);color:var(--text,#1a1814);background:#fff}.na-rating-track-wrap.jsx-66aa90066b389d3c{flex:1;position:relative}.na-rating-pill.jsx-66aa90066b389d3c{border-radius:var(--r-full,999px);background:var(--rng-deep);color:#fff;white-space:nowrap;pointer-events:none;align-items:center;gap:8px;padding:5px 13px;font-size:.8125rem;font-weight:600;display:inline-flex;position:absolute;bottom:calc(100% + 12px);transform:translate(-50%);box-shadow:0 2px 8px #3a2d1e38}.na-rating-pill.jsx-66aa90066b389d3c:after{content:"";border:5px solid #0000;border-top-color:var(--rng-deep);position:absolute;top:100%;left:50%;transform:translate(-50%)}.na-rating-pill-unrated.jsx-66aa90066b389d3c{background:var(--surface-up,#ece9e3);color:var(--text-mid,#555);box-shadow:none;font-weight:500}.na-rating-pill-unrated.jsx-66aa90066b389d3c:after{border-top-color:var(--surface-up,#ece9e3)}.na-rating-sep.jsx-66aa90066b389d3c{opacity:.4;font-weight:400}.na-rating-value.jsx-66aa90066b389d3c{font-variant-numeric:tabular-nums}.na-rating-slider [data-slot=slider-track]{background:var(--surface-up,#ece9e3);border-radius:8px;height:8px}.na-rating-slider [data-slot=slider-range]{background:var(--rng-accent)}.na-rating-slider [data-slot=slider-thumb]{border-color:var(--rng-accent);cursor:grab;width:18px;height:18px;box-shadow:0 1px 4px #0003}.na-rating-slider [data-slot=slider-thumb]:active{cursor:grabbing}.na-rating-slider-unrated [data-slot=slider-range]{background:var(--line-mid,#c9c6bf)}.na-rating-slider-unrated [data-slot=slider-thumb]{border-color:var(--line-mid,#c9c6bf)}'
            }, void 0, false, void 0, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/relevance-rating.tsx",
        lineNumber: 62,
        columnNumber: 5
    }, this);
}
_s(RelevanceRating, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = RelevanceRating;
var _c;
__turbopack_context__.k.register(_c, "RelevanceRating");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/useDebouncedCallback.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useDebouncedCallback",
    ()=>useDebouncedCallback
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
;
function useDebouncedCallback(fn, delay) {
    _s();
    const fnRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(fn);
    fnRef.current = fn; // immer die aktuellste Closure aufrufen (frische onRated/argument)
    const timer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const pending = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const flush = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useDebouncedCallback.useCallback[flush]": ()=>{
            if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            if (pending.current) {
                const a = pending.current;
                pending.current = null;
                fnRef.current(...a);
            }
        }
    }["useDebouncedCallback.useCallback[flush]"], []);
    const debounced = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useDebouncedCallback.useCallback[debounced]": (...args)=>{
            pending.current = args;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flush, delay);
        }
    }["useDebouncedCallback.useCallback[debounced]"], [
        delay,
        flush
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useDebouncedCallback.useEffect": ()=>({
                "useDebouncedCallback.useEffect": ()=>flush()
            })["useDebouncedCallback.useEffect"]
    }["useDebouncedCallback.useEffect"], [
        flush
    ]); // beim Unmount flushen → letzten Wert nicht verwerfen
    return {
        debounced,
        flush
    };
}
_s(useDebouncedCallback, "mAezIkz0IZTf4SnlDVRN3YLabpA=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/queries/taxonomy.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "patchTaxonomyPreference",
    ()=>patchTaxonomyPreference,
    "taxonomyKeys",
    ()=>taxonomyKeys,
    "useTaxonomyBase",
    ()=>useTaxonomyBase,
    "useTaxonomyFull",
    ()=>useTaxonomyFull,
    "useTaxonomyTopic",
    ()=>useTaxonomyTopic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature();
"use client";
;
;
const taxonomyKeys = {
    all: (ballotId)=>[
            "taxonomy",
            ballotId
        ],
    base: (ballotId, locale)=>[
            "taxonomy",
            ballotId,
            locale,
            "base"
        ],
    full: (ballotId, locale)=>[
            "taxonomy",
            ballotId,
            locale,
            "full"
        ],
    topic: (ballotId, locale, topic)=>[
            "taxonomy",
            ballotId,
            locale,
            "topic",
            topic
        ]
};
function useTaxonomyBase(ballotId, locale, enabled = true) {
    _s();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: taxonomyKeys.base(ballotId, locale),
        queryFn: {
            "useTaxonomyBase.useQuery": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getTaxonomy"])(ballotId, locale)
        }["useTaxonomyBase.useQuery"],
        enabled
    });
}
_s(useTaxonomyBase, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useTaxonomyFull(ballotId, locale, enabled = true) {
    _s1();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: taxonomyKeys.full(ballotId, locale),
        queryFn: {
            "useTaxonomyFull.useQuery": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getTaxonomy"])(ballotId, locale, undefined, "full")
        }["useTaxonomyFull.useQuery"],
        enabled
    });
}
_s1(useTaxonomyFull, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useTaxonomyTopic(ballotId, locale, topic, enabled = true) {
    _s2();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: taxonomyKeys.topic(ballotId, locale, topic),
        queryFn: {
            "useTaxonomyTopic.useQuery": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getTaxonomy"])(ballotId, locale, topic)
        }["useTaxonomyTopic.useQuery"],
        enabled
    });
}
_s2(useTaxonomyTopic, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
// ─── Knoten-Aggregate (Client-Spiegel von _aggregate) ───────────────────────
// QUELLE DER WAHRHEIT ist das Backend: services/appview/src/routes/deliberation/
// taxonomy.py → `_aggregate`. Diese Funktion ist ein bewusst gehaltener Mirror,
// damit Bewertungen lokal sofort durchschlagen (ohne Refetch/Indexer-Lag). Bei
// Formel-Änderungen im Backend HIER nachziehen — der Mirror heilt sich sonst
// erst beim nächsten vollen Laden (Backend bleibt autoritativ).
//
// Postorder über den Teilbaum, identisch zu `_aggregate`: je Knoten die DISTINCT-
// uris des GANZEN Teilbaums (eigene + rekursiv die der Kinder) sammeln, dann
// pos/neg/rated darüber. Damit korrekt für den verschachtelten full-Baum
// (Sunburst, je Knoten direkte Argumente) UND den flachen base/topic-Baum (je
// Knoten bereits der rollup). `argumentCount` bleibt unangetastet (ändert sich
// durch eine Bewertung nicht).
const round4 = (x)=>Math.round(x * 1e4) / 1e4;
function patchTaxonomyPreference(tree, uri, preference) {
    if (!tree?.tree) return tree;
    // Liefert den neuen Knoten + die distinct Argumente seines Teilbaums (Map
    // uri→arg), damit der Elternknoten sie dedupliziert vereinigen kann.
    const visit = (node)=>{
        const ownArgs = (node.arguments ?? []).map((a)=>a.uri === uri ? {
                ...a,
                viewerPreference: preference
            } : a);
        const childResults = node.children.map(visit);
        const subtree = new Map();
        for (const a of ownArgs)if (!subtree.has(a.uri)) subtree.set(a.uri, a);
        for (const cr of childResults)for (const [u, a] of cr.subtree)if (!subtree.has(u)) subtree.set(u, a);
        const next = {
            ...node,
            arguments: ownArgs,
            children: childResults.map((cr)=>cr.node)
        };
        if (subtree.size > 0) {
            let pos = 0;
            let neg = 0;
            let rated = 0;
            for (const a of subtree.values()){
                const pref = a.viewerPreference;
                if (pref == null) continue;
                rated += 1; // neutral (50) zählt als bewertet, trägt aber 0 bei
                const sign = a.type === "PRO" ? 1 : -1;
                const contrib = sign * (pref - 50) / 50; // ∈ [-1,1]
                if (contrib > 0) pos += contrib;
                else if (contrib < 0) neg += -contrib;
            }
            const total = pos + neg;
            next.proLeaning = total > 0 ? round4((pos - neg) / total) : null;
            next.dissent = total > 0 ? round4(2 * Math.min(pos, neg) / total) : 0;
            next.ratedCount = rated;
        }
        return {
            node: next,
            subtree
        };
    };
    return {
        ...tree,
        tree: visit(tree.tree).node
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/queries/arguments.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "argumentKeys",
    ()=>argumentKeys,
    "useArgumentQuery",
    ()=>useArgumentQuery,
    "useArgumentRatingCache",
    ()=>useArgumentRatingCache,
    "useRateArgumentMutation",
    ()=>useRateArgumentMutation
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useMutation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ballots$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/ballots.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/queries/taxonomy.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
const argumentKeys = {
    // Argumentliste eines Ballots — gelesen von der Booklet-Seite.
    list: (ballotId)=>[
            "arguments",
            ballotId
        ],
    // Ein einzelnes Argument (Overlay-Detail).
    detail: (ballotId, rkey)=>[
            "argument",
            ballotId,
            rkey
        ],
    // Präfix über alle Einzel-Argumente eines Ballots — für Cache-Patches, die
    // jedes geladene Detail mittreffen sollen (z. B. eine Bewertung).
    detailPrefix: (ballotId)=>[
            "argument",
            ballotId
        ]
};
function useArgumentQuery(ballotRkey, rkey, enabled) {
    _s();
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        // Locale in the key so switching language refetches (localized via the
        // proxy's ?lang injection). detailPrefix stays locale-free for cache patches.
        queryKey: [
            ...argumentKeys.detail(ballotRkey, rkey),
            locale
        ],
        queryFn: {
            "useArgumentQuery.useQuery": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getArgument"])(ballotRkey, rkey)
        }["useArgumentQuery.useQuery"],
        enabled
    });
}
_s(useArgumentQuery, "9R4uR2xp4TwajEntHgEghQQvqe0=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
// ─── Bewertung im Cache spiegeln ─────────────────────────────────────────────
// Setzt `viewer.preference` eines Arguments direkt im Cache — sowohl in der
// Liste als auch (falls geladen) im Einzel-Detail. Weil die Booklet-Seite die
// Liste via `useQuery` abonniert, aktualisiert sich ihre Karte dadurch von
// selbst. Das ersetzt die frühere `onArgumentRated`-Callback-Registry.
function withPreference(a, preference) {
    const viewer = {
        ...a.viewer
    };
    if (preference === null) delete viewer.preference;
    else viewer.preference = preference;
    return {
        ...a,
        viewer
    };
}
function useArgumentRatingCache(ballotId) {
    _s1();
    const qc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useArgumentRatingCache.useCallback": (uri, preference)=>{
            const apply = {
                "useArgumentRatingCache.useCallback.apply": (a)=>a.uri === uri ? withPreference(a, preference) : a
            }["useArgumentRatingCache.useCallback.apply"];
            // Booklet-Liste (`viewer.preference`) — Prefix-Match über alle Locales,
            // da der Listen-Key jetzt die Locale enthält.
            qc.setQueriesData({
                queryKey: argumentKeys.list(ballotId)
            }, {
                "useArgumentRatingCache.useCallback": (prev)=>prev?.map(apply)
            }["useArgumentRatingCache.useCallback"]);
            // Einzel-Argument im Overlay-Detail (`viewer.preference`).
            qc.setQueriesData({
                queryKey: argumentKeys.detailPrefix(ballotId)
            }, {
                "useArgumentRatingCache.useCallback": (prev)=>prev ? apply(prev) : prev
            }["useArgumentRatingCache.useCallback"]);
            // Taxonomy-Bäume (base/full/topic, alle Locales): `viewerPreference` an
            // allen Vorkommen der uri im Baum setzen.
            qc.setQueriesData({
                queryKey: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["taxonomyKeys"].all(ballotId)
            }, {
                "useArgumentRatingCache.useCallback": (prev)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["patchTaxonomyPreference"])(prev, uri, preference) ?? prev
            }["useArgumentRatingCache.useCallback"]);
        }
    }["useArgumentRatingCache.useCallback"], [
        qc,
        ballotId
    ]);
}
_s1(useArgumentRatingCache, "3DAylfIS1k8MNAja8aXB+gGqf3E=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"]
    ];
});
function useRateArgumentMutation() {
    _s2();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"])({
        mutationFn: {
            "useRateArgumentMutation.useMutation": ({ uri, cid, preference })=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$ballots$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rateContent"])(uri, cid, preference)
        }["useRateArgumentMutation.useMutation"]
    });
}
_s2(useRateArgumentMutation, "wwwtpB20p0aLiHIvSy5P98MwIUg=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/toast.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "notifyPdsError",
    ()=>notifyPdsError
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/pdsError.ts [app-client] (ecmascript)");
;
;
function notifyPdsError(t, e) {
    const message = t((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pdsErrorKey"])(e));
    if (e.code === "auth_required") {
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error(message, {
            action: {
                label: t("reLogin"),
                onClick: ()=>{
                    if ("TURBOPACK compile-time truthy", 1) window.location.assign("/");
                }
            }
        });
        return;
    }
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error(message);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/argument-detail.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ArgumentDetail",
    ()=>ArgumentDetail
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$styled$2d$jsx$2f$style$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/styled-jsx/style.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$AuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/AuthContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$commentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/commentThread.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useCommentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/useCommentThread.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$separator$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/separator.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/alert.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/spinner.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pro$2d$contra$2d$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/pro-contra-badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$comment$2d$content$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/comment-content.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$reply$2d$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/reply-input.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$relevance$2d$rating$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/relevance-rating.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useDebouncedCallback$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/useDebouncedCallback.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$arguments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/queries/arguments.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/pdsError.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$toast$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/toast.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
// ---------------------------------------------------------------------------
// Comment node (recursive, clickable)
// ---------------------------------------------------------------------------
// Sentinel target for the top-level comment composer (vs. a comment uri reply).
const ROOT_TARGET = "__root__";
// Bewertungen werden gebündelt: schnelle Reglerbewegungen / +–-Klicks lösen nur
// EINEN Netzwerk-Write aus (letzter Wert), nach dieser Ruhephase in ms.
const RATE_DEBOUNCE_MS = 1000;
function CommentNode({ comment, depth, onLikeToggle, onReply, onNavigate, activeComposerUri, renderComposer }) {
    const indent = ("TURBOPACK compile-time value", "object") !== "undefined" && window.innerWidth < 640 ? 16 : 24;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            paddingLeft: depth > 0 ? indent : 0
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                "data-overlay-anchor": comment.uri,
                onClick: ()=>onNavigate(comment.uri),
                className: "flex gap-2 pt-2.5 pb-1.5 cursor-pointer",
                style: {
                    borderLeft: depth > 0 ? "2px solid #e0e0e0" : "none",
                    paddingLeft: depth > 0 ? 10 : 0
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$comment$2d$content$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommentAvatar"], {
                        comment: comment,
                        size: 28
                    }, void 0, false, {
                        fileName: "[project]/src/components/argument-detail.tsx",
                        lineNumber: 74,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex-1 min-w-0",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$comment$2d$content$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommentContent"], {
                            comment: comment,
                            onLikeToggle: onLikeToggle,
                            onReply: onReply
                        }, void 0, false, {
                            fileName: "[project]/src/components/argument-detail.tsx",
                            lineNumber: 76,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/argument-detail.tsx",
                        lineNumber: 75,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/argument-detail.tsx",
                lineNumber: 65,
                columnNumber: 7
            }, this),
            comment.uri === activeComposerUri && renderComposer && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pl-9 pb-2",
                children: renderComposer()
            }, void 0, false, {
                fileName: "[project]/src/components/argument-detail.tsx",
                lineNumber: 84,
                columnNumber: 9
            }, this),
            comment.replies && comment.replies.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: comment.replies.map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(CommentNode, {
                        comment: r,
                        depth: Math.min(depth + 1, 2),
                        onLikeToggle: onLikeToggle,
                        onReply: onReply,
                        onNavigate: onNavigate,
                        activeComposerUri: activeComposerUri,
                        renderComposer: renderComposer
                    }, r.uri, false, {
                        fileName: "[project]/src/components/argument-detail.tsx",
                        lineNumber: 89,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/argument-detail.tsx",
                lineNumber: 87,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/argument-detail.tsx",
        lineNumber: 64,
        columnNumber: 5
    }, this);
}
_c = CommentNode;
function ArgumentDetail({ onClose, argRkey, onNavigateToComment, onNavigateToTaxonomy, backLabel, registerScrollContainer }) {
    _s();
    const { isAuthenticated, loading: authLoading } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$AuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuth"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"])();
    const ballotRkey = params.id;
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("argumentDetail");
    const tc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("common");
    const te = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("errors");
    const tbk = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("booklet");
    // Argument aus dem zentralen Query-Cache (Key `argumentKeys.detail`). Derselbe
    // Präfix, den `useArgumentRatingCache` patcht — Booklet-Liste und dieses
    // Detail teilen damit eine Quelle für `viewer.preference`.
    const enabled = isAuthenticated && !authLoading && !!ballotRkey && !!argRkey;
    const { data: argument = null, isPending, error: argError } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$arguments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useArgumentQuery"])(ballotRkey, argRkey, enabled);
    const loading = enabled && isPending;
    const error = argError ? argError instanceof Error ? argError.message : "Failed to load argument" : "";
    // Relevanz-Bewertung des Users (1–100) oder null, wenn noch nicht bewertet.
    // Lokaler State für den Slider (Live-Drag); aus dem geladenen Argument geseedet.
    const [relevance, setRelevance] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    // Letzter erfolgreich persistierter Wert — Rollback-Baseline bei Fehlern.
    const committedRelevance = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const { comments, commentsLoading, toggleLike, submitComment, replyText, setReplyText, submitting, replyTarget, setReplyTarget, replyInputRef, commentError } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useCommentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCommentThread"])(argument?.uri, {
        onError: {
            "ArgumentDetail.useCommentThread": (e)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$toast$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["notifyPdsError"])(te, e)
        }["ArgumentDetail.useCommentThread"]
    });
    // Derive the top-level comment tree from the flat list.
    const roots = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ArgumentDetail.useMemo[roots]": ()=>{
            const map = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$commentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildCommentMap"])(comments);
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$commentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rootComments"])(comments, map);
        }
    }["ArgumentDetail.useMemo[roots]"], [
        comments
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ArgumentDetail.useEffect": ()=>{
            if (authLoading) return;
            if (!isAuthenticated) router.push("/");
        }
    }["ArgumentDetail.useEffect"], [
        isAuthenticated,
        authLoading,
        router
    ]);
    // Slider-State aus dem geladenen Argument seeden — nur bei Argumentwechsel
    // (Key = uri), damit ein Cache-Patch durch die eigene Bewertung den lokalen
    // Wert nicht zurücksetzt.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ArgumentDetail.useEffect": ()=>{
            const pref = argument?.viewer?.preference ?? null;
            setRelevance(pref);
            committedRelevance.current = pref;
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }
    }["ArgumentDetail.useEffect"], [
        argument?.uri
    ]);
    // Leerer Thread → Top-Level-Composer direkt öffnen. Einmal je Argument, sobald
    // die Kommentarliste geladen ist (sonst würde ein Refetch die Auswahl stören).
    const composerInitFor = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ArgumentDetail.useEffect": ()=>{
            if (!argument?.uri || commentsLoading) return;
            if (composerInitFor.current === argument.uri) return;
            composerInitFor.current = argument.uri;
            setReplyTarget(comments.length === 0 ? ROOT_TARGET : null);
        }
    }["ArgumentDetail.useEffect"], [
        argument?.uri,
        commentsLoading,
        comments.length,
        setReplyTarget
    ]);
    // Bewertung in den zentralen Query-Cache spiegeln (Booklet-Liste + ggf.
    // Detail). Das ersetzt den früheren `onRated`-Callback an die Host-Seite.
    const patchRating = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$arguments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useArgumentRatingCache"])(ballotRkey);
    const rateMutation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$arguments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRateArgumentMutation"])();
    // Gebündelter Netzwerk-Write (idempotent serverseitig, deterministischer rkey).
    // Das optimistische UI-Update hat `handleRateCommit` bereits angewandt; hier feuert
    // nur noch der eigentliche POST — nach RATE_DEBOUNCE_MS Ruhe mit dem letzten Wert.
    const { debounced: debouncedRate } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useDebouncedCallback$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDebouncedCallback"])({
        "ArgumentDetail.useDebouncedCallback": (uri, cid, value)=>{
            // Rollback-Baseline = letzter erfolgreich persistierter Wert. Zwischenschritte
            // berühren `committedRelevance` nicht, daher stimmt der Wert hier.
            const prev = committedRelevance.current;
            rateMutation.mutate({
                uri,
                cid,
                preference: value
            }, {
                onSuccess: {
                    "ArgumentDetail.useDebouncedCallback": ()=>{
                        committedRelevance.current = value;
                    }
                }["ArgumentDetail.useDebouncedCallback"],
                onError: {
                    "ArgumentDetail.useDebouncedCallback": (err)=>{
                        setRelevance(prev); // lokalen Slider zurückrollen
                        patchRating(uri, prev); // Booklet-Karte zurückrollen
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$toast$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["notifyPdsError"])(te, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isPdsError"])(err) ? err : {
                            code: "unknown",
                            status: 0
                        });
                    }
                }["ArgumentDetail.useDebouncedCallback"]
            });
        }
    }["ArgumentDetail.useDebouncedCallback"], RATE_DEBOUNCE_MS);
    // Bewertung persistieren (beim Loslassen des Reglers / +–-Buttons).
    const handleRateCommit = (value)=>{
        if (!argument) return;
        const uri = argument.uri;
        setRelevance(value); // sofortiges optimistisches UI (Slider/Score im Overlay)
        patchRating(uri, value); // sofortiges Update der Booklet-Karte via Cache
        debouncedRate(uri, argument.cid, value); // gebündelter Netzwerk-Write
    };
    const handleSubmitComment = ()=>{
        if (!argument) return;
        const parentUri = replyTarget && replyTarget !== ROOT_TARGET ? replyTarget : undefined;
        submitComment(argument.uri, parentUri);
    };
    const renderComposer = ()=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-2",
            children: [
                commentError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Alert"], {
                    variant: "destructive",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDescription"], {
                        children: te((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pdsErrorKey"])(commentError))
                    }, void 0, false, {
                        fileName: "[project]/src/components/argument-detail.tsx",
                        lineNumber: 266,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/argument-detail.tsx",
                    lineNumber: 265,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$reply$2d$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ReplyInput"], {
                    ref: replyInputRef,
                    value: replyText,
                    onChange: setReplyText,
                    onSubmit: handleSubmitComment,
                    submitting: submitting,
                    placeholder: t("commentPlaceholder"),
                    onCancel: ()=>{
                        setReplyText("");
                        setReplyTarget(null);
                    }
                }, void 0, false, {
                    fileName: "[project]/src/components/argument-detail.tsx",
                    lineNumber: 269,
                    columnNumber: 7
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/argument-detail.tsx",
            lineNumber: 263,
            columnNumber: 5
        }, this);
    if (authLoading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-center justify-center min-h-[50vh] gap-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Spinner"], {}, void 0, false, {
                    fileName: "[project]/src/components/argument-detail.tsx",
                    lineNumber: 287,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "text-muted-foreground",
                    children: tc("restoringSession")
                }, void 0, false, {
                    fileName: "[project]/src/components/argument-detail.tsx",
                    lineNumber: 288,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/argument-detail.tsx",
            lineNumber: 286,
            columnNumber: 7
        }, this);
    }
    if (!isAuthenticated) return null;
    const isPro = argument?.record.type === "PRO";
    const isOfficial = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pro$2d$contra$2d$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isOfficialArgument"])(argument?.record.source);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: registerScrollContainer,
        className: "jsx-1c5302784e48774c" + " " + "ov-card",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$styled$2d$jsx$2f$style$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                id: "1c5302784e48774c",
                children: '.ov-card.jsx-1c5302784e48774c{background:var(--background);border:1px solid var(--border);border-radius:12px;flex-direction:column;height:100%;display:flex;overflow-y:auto;box-shadow:0 30px 70px -20px #2d231673}.ov-arg.jsx-1c5302784e48774c{flex-direction:column;gap:11px;display:flex}.ov-arg-top.jsx-1c5302784e48774c{align-items:center;gap:9px;display:flex}.ov-badge.jsx-1c5302784e48774c{letter-spacing:.02em;border-radius:var(--r-full,999px);flex-shrink:0;padding:3px 10px;font-size:.6875rem;font-weight:700}.ov-badge-pro.jsx-1c5302784e48774c{background:var(--pro-dim);color:var(--pro)}.ov-badge-contra.jsx-1c5302784e48774c{background:var(--contra-dim);color:var(--contra)}.ov-arg-title.jsx-1c5302784e48774c{font-family:var(--font-serif),Georgia,"Times New Roman",serif;letter-spacing:-.01em;color:var(--text);margin:0;font-size:1.25rem;font-weight:600;line-height:1.25}.ov-arg-body.jsx-1c5302784e48774c{color:var(--text-mid);margin:0;font-size:.9375rem;line-height:1.55}.ov-arg-meta.jsx-1c5302784e48774c{color:var(--text-mid);flex-wrap:wrap;align-items:center;gap:16px;font-size:.75rem;display:flex}'
            }, void 0, false, void 0, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "jsx-1c5302784e48774c" + " " + "sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b flex items-center px-5 py-3",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: onClose,
                    className: "jsx-1c5302784e48774c" + " " + "flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "jsx-1c5302784e48774c" + " " + "text-base leading-none",
                            children: "←"
                        }, void 0, false, {
                            fileName: "[project]/src/components/argument-detail.tsx",
                            lineNumber: 369,
                            columnNumber: 11
                        }, this),
                        backLabel
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/argument-detail.tsx",
                    lineNumber: 365,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/argument-detail.tsx",
                lineNumber: 364,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "jsx-1c5302784e48774c" + " " + "px-5 py-6 space-y-6",
                children: [
                    error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Alert"], {
                        variant: "destructive",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDescription"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    className: "jsx-1c5302784e48774c",
                                    children: [
                                        tc("error"),
                                        ":"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/argument-detail.tsx",
                                    lineNumber: 378,
                                    columnNumber: 15
                                }, this),
                                " ",
                                error
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/argument-detail.tsx",
                            lineNumber: 377,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/argument-detail.tsx",
                        lineNumber: 376,
                        columnNumber: 11
                    }, this),
                    loading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "jsx-1c5302784e48774c" + " " + "flex items-center justify-center py-16 gap-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Spinner"], {}, void 0, false, {
                                fileName: "[project]/src/components/argument-detail.tsx",
                                lineNumber: 385,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "jsx-1c5302784e48774c" + " " + "text-muted-foreground",
                                children: t("loadingArgument")
                            }, void 0, false, {
                                fileName: "[project]/src/components/argument-detail.tsx",
                                lineNumber: 386,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/argument-detail.tsx",
                        lineNumber: 384,
                        columnNumber: 11
                    }, this),
                    !loading && argument && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "jsx-1c5302784e48774c" + " " + "ov-arg",
                                children: [
                                    argument.topicPaths && argument.topicPaths.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "jsx-1c5302784e48774c" + " " + "flex flex-col gap-0.5",
                                        children: argument.topicPaths.map((path, pi)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                                                className: "jsx-1c5302784e48774c" + " " + "flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground",
                                                children: path.map((seg, si)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "jsx-1c5302784e48774c" + " " + "flex items-center gap-x-1",
                                                        children: [
                                                            si > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "jsx-1c5302784e48774c" + " " + "opacity-40",
                                                                children: "›"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/argument-detail.tsx",
                                                                lineNumber: 407,
                                                                columnNumber: 38
                                                            }, this),
                                                            seg.key ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                title: seg.description ?? undefined,
                                                                onClick: ()=>onNavigateToTaxonomy(ballotRkey, seg.key),
                                                                className: "jsx-1c5302784e48774c" + " " + "hover:text-foreground hover:underline",
                                                                children: seg.name
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/argument-detail.tsx",
                                                                lineNumber: 409,
                                                                columnNumber: 29
                                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                title: seg.description ?? undefined,
                                                                className: "jsx-1c5302784e48774c" + " " + "cursor-default",
                                                                children: seg.name
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/argument-detail.tsx",
                                                                lineNumber: 418,
                                                                columnNumber: 29
                                                            }, this)
                                                        ]
                                                    }, si, true, {
                                                        fileName: "[project]/src/components/argument-detail.tsx",
                                                        lineNumber: 406,
                                                        columnNumber: 25
                                                    }, this))
                                            }, pi, false, {
                                                fileName: "[project]/src/components/argument-detail.tsx",
                                                lineNumber: 401,
                                                columnNumber: 21
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/argument-detail.tsx",
                                        lineNumber: 399,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "jsx-1c5302784e48774c" + " " + "ov-arg-top",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "jsx-1c5302784e48774c" + " " + `ov-badge ov-badge-${isPro ? "pro" : "contra"}`,
                                            children: isPro ? tbk("proArgument") : tbk("contraArgument")
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/argument-detail.tsx",
                                            lineNumber: 432,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/argument-detail.tsx",
                                        lineNumber: 431,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        className: "jsx-1c5302784e48774c" + " " + "ov-arg-title",
                                        children: [
                                            argument.record.title,
                                            isOfficial && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pro$2d$contra$2d$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OfficialStar"], {}, void 0, false, {
                                                fileName: "[project]/src/components/argument-detail.tsx",
                                                lineNumber: 440,
                                                columnNumber: 32
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/argument-detail.tsx",
                                        lineNumber: 438,
                                        columnNumber: 15
                                    }, this),
                                    argument.record.body && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "jsx-1c5302784e48774c" + " " + "ov-arg-body",
                                        children: argument.record.body
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/argument-detail.tsx",
                                        lineNumber: 443,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "jsx-1c5302784e48774c" + " " + "ov-arg-meta",
                                        children: [
                                            (argument.likeCount ?? 0) > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "jsx-1c5302784e48774c",
                                                children: [
                                                    "♡",
                                                    " ",
                                                    argument.likeCount
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/argument-detail.tsx",
                                                lineNumber: 447,
                                                columnNumber: 19
                                            }, this),
                                            (argument.commentCount ?? 0) > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "jsx-1c5302784e48774c",
                                                children: [
                                                    "💬",
                                                    " ",
                                                    argument.commentCount
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/argument-detail.tsx",
                                                lineNumber: 452,
                                                columnNumber: 19
                                            }, this),
                                            isOfficial ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pro$2d$contra$2d$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OfficialBadge"], {}, void 0, false, {
                                                fileName: "[project]/src/components/argument-detail.tsx",
                                                lineNumber: 457,
                                                columnNumber: 19
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pro$2d$contra$2d$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PeerreviewStatusBadge"], {
                                                status: argument.peerreviewStatus
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/argument-detail.tsx",
                                                lineNumber: 459,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/argument-detail.tsx",
                                        lineNumber: 445,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/argument-detail.tsx",
                                lineNumber: 395,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "jsx-1c5302784e48774c" + " " + "rounded-xl border border-border/60 bg-card px-5 py-4 shadow-sm",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "jsx-1c5302784e48774c" + " " + "text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4",
                                        children: t("yourRating")
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/argument-detail.tsx",
                                        lineNumber: 467,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$relevance$2d$rating$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RelevanceRating"], {
                                        value: relevance,
                                        onChange: setRelevance,
                                        onCommit: handleRateCommit,
                                        accent: isPro ? "pro" : "contra"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/argument-detail.tsx",
                                        lineNumber: 470,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/argument-detail.tsx",
                                lineNumber: 466,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$separator$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Separator"], {}, void 0, false, {
                                fileName: "[project]/src/components/argument-detail.tsx",
                                lineNumber: 478,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "jsx-1c5302784e48774c",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "jsx-1c5302784e48774c" + " " + "text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4",
                                        children: [
                                            t("comments"),
                                            roots.length > 0 ? ` (${roots.length})` : ""
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/argument-detail.tsx",
                                        lineNumber: 482,
                                        columnNumber: 15
                                    }, this),
                                    roots.length === 0 && replyTarget !== ROOT_TARGET && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "jsx-1c5302784e48774c" + " " + "text-muted-foreground text-sm m-0",
                                        children: t("noComments")
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/argument-detail.tsx",
                                        lineNumber: 487,
                                        columnNumber: 17
                                    }, this),
                                    roots.length > 0 && roots.map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(CommentNode, {
                                            comment: c,
                                            depth: 0,
                                            onLikeToggle: toggleLike,
                                            onReply: setReplyTarget,
                                            onNavigate: onNavigateToComment,
                                            activeComposerUri: replyTarget,
                                            renderComposer: renderComposer
                                        }, c.uri, false, {
                                            fileName: "[project]/src/components/argument-detail.tsx",
                                            lineNumber: 493,
                                            columnNumber: 19
                                        }, this)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "jsx-1c5302784e48774c" + " " + ((roots.length > 0 ? "pt-3 mt-3 border-t" : "pt-1") || ""),
                                        children: replyTarget === ROOT_TARGET ? renderComposer() : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                            variant: "outline",
                                            className: "w-full justify-center",
                                            onClick: ()=>setReplyTarget(ROOT_TARGET),
                                            children: [
                                                "💬 ",
                                                t("writeComment")
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/argument-detail.tsx",
                                            lineNumber: 510,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/argument-detail.tsx",
                                        lineNumber: 506,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/argument-detail.tsx",
                                lineNumber: 481,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/argument-detail.tsx",
                lineNumber: 374,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/argument-detail.tsx",
        lineNumber: 298,
        columnNumber: 5
    }, this);
}
_s(ArgumentDetail, "0t/PQFRou/OUmv2TrZSjAVs36Ac=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$AuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuth"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$arguments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useArgumentQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useCommentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCommentThread"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$arguments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useArgumentRatingCache"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$arguments$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRateArgumentMutation"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useDebouncedCallback$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDebouncedCallback"]
    ];
});
_c1 = ArgumentDetail;
var _c, _c1;
__turbopack_context__.k.register(_c, "CommentNode");
__turbopack_context__.k.register(_c1, "ArgumentDetail");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/argument-summary.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ArgumentSummary",
    ()=>ArgumentSummary
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pro$2d$contra$2d$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/pro-contra-badge.tsx [app-client] (ecmascript)");
"use client";
;
;
;
function ArgumentSummary({ title, body, type, likeCount, commentCount, peerreviewStatus, onClick, clampBody = false, titleClassName = "text-base" }) {
    const accentColor = type === "PRO" ? "var(--pro)" : type === "CONTRA" ? "var(--contra)" : "var(--border)";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        onClick: onClick,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("pl-4 pr-2 py-2 rounded-r", onClick && "cursor-pointer hover:bg-muted/40 transition-colors"),
        style: {
            borderLeft: `4px solid ${accentColor}`
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-start gap-2 mb-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("font-bold flex-1 leading-snug m-0", titleClassName),
                        children: title
                    }, void 0, false, {
                        fileName: "[project]/src/components/argument-summary.tsx",
                        lineNumber: 50,
                        columnNumber: 9
                    }, this),
                    type && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pro$2d$contra$2d$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ProContraBadge"], {
                        type: type.toLowerCase()
                    }, void 0, false, {
                        fileName: "[project]/src/components/argument-summary.tsx",
                        lineNumber: 53,
                        columnNumber: 18
                    }, this),
                    onClick && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-muted-foreground text-base leading-none mt-0.5",
                        children: "›"
                    }, void 0, false, {
                        fileName: "[project]/src/components/argument-summary.tsx",
                        lineNumber: 55,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/argument-summary.tsx",
                lineNumber: 49,
                columnNumber: 7
            }, this),
            body && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-sm text-muted-foreground leading-relaxed m-0 mb-2", clampBody && "line-clamp-2"),
                children: body
            }, void 0, false, {
                fileName: "[project]/src/components/argument-summary.tsx",
                lineNumber: 61,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex gap-4 text-xs text-muted-foreground items-center flex-wrap",
                children: [
                    (likeCount ?? 0) > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            "♡",
                            " ",
                            likeCount
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/argument-summary.tsx",
                        lineNumber: 72,
                        columnNumber: 11
                    }, this),
                    (commentCount ?? 0) > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            "💬",
                            " ",
                            commentCount
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/argument-summary.tsx",
                        lineNumber: 77,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pro$2d$contra$2d$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PeerreviewStatusBadge"], {
                        status: peerreviewStatus
                    }, void 0, false, {
                        fileName: "[project]/src/components/argument-summary.tsx",
                        lineNumber: 81,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/argument-summary.tsx",
                lineNumber: 70,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/argument-summary.tsx",
        lineNumber: 41,
        columnNumber: 5
    }, this);
}
_c = ArgumentSummary;
var _c;
__turbopack_context__.k.register(_c, "ArgumentSummary");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/comment-detail.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CommentDetail",
    ()=>CommentDetail
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$AuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/AuthContext.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$commentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/commentThread.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useCommentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/useCommentThread.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/pdsError.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$toast$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/toast.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/alert.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/spinner.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$argument$2d$summary$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/argument-summary.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$comment$2d$content$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/comment-content.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$reply$2d$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/reply-input.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
// ---------------------------------------------------------------------------
// PostRow — one comment in the thread (used for ancestors, focal and replies).
// The avatar column carries the vertical thread line that visually connects
// the ancestor chain to the focal comment (X / Bluesky style).
// ---------------------------------------------------------------------------
const AVATAR = 32;
function PostRow({ comment, focal = false, clickable = false, clamp = false, showLineTop = false, showLineBottom = false, onNavigate, onLikeToggle, onReply, activeComposerUri, renderComposer }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-overlay-anchor": comment.uri,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col items-center",
                        style: {
                            width: AVATAR
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("w-0.5 shrink-0", showLineTop ? "bg-border" : "bg-transparent"),
                                style: {
                                    height: 8
                                }
                            }, void 0, false, {
                                fileName: "[project]/src/components/comment-detail.tsx",
                                lineNumber: 58,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$comment$2d$content$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommentAvatar"], {
                                comment: comment,
                                size: AVATAR
                            }, void 0, false, {
                                fileName: "[project]/src/components/comment-detail.tsx",
                                lineNumber: 65,
                                columnNumber: 11
                            }, this),
                            showLineBottom && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "w-0.5 flex-1 mt-1 bg-border"
                            }, void 0, false, {
                                fileName: "[project]/src/components/comment-detail.tsx",
                                lineNumber: 66,
                                columnNumber: 30
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/comment-detail.tsx",
                        lineNumber: 57,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex-1 min-w-0 pb-4", clickable && "cursor-pointer"),
                        onClick: clickable ? ()=>onNavigate?.(comment.uri) : undefined,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])(focal && "rounded-r-md px-3 py-2"),
                            style: focal ? {
                                backgroundColor: "var(--brand-dim)",
                                borderLeft: "2px solid var(--brand)"
                            } : undefined,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$comment$2d$content$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommentContent"], {
                                comment: comment,
                                focal: focal,
                                clamp: clamp,
                                onLikeToggle: onLikeToggle,
                                onReply: onReply
                            }, void 0, false, {
                                fileName: "[project]/src/components/comment-detail.tsx",
                                lineNumber: 85,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/comment-detail.tsx",
                            lineNumber: 74,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/comment-detail.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/comment-detail.tsx",
                lineNumber: 55,
                columnNumber: 7
            }, this),
            comment.uri === activeComposerUri && renderComposer && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pl-11 pb-3",
                children: renderComposer()
            }, void 0, false, {
                fileName: "[project]/src/components/comment-detail.tsx",
                lineNumber: 96,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/comment-detail.tsx",
        lineNumber: 54,
        columnNumber: 5
    }, this);
}
_c = PostRow;
// ---------------------------------------------------------------------------
// ReplyTree — direct replies below the focal comment, nested via indentation.
// ---------------------------------------------------------------------------
function ReplyTree({ comment, depth, onNavigate, onLikeToggle, onReply, activeComposerUri, renderComposer }) {
    const showChildren = !!comment.replies && comment.replies.length > 0 && depth < 2;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PostRow, {
                comment: comment,
                clickable: true,
                onNavigate: onNavigate,
                onLikeToggle: onLikeToggle,
                onReply: onReply,
                activeComposerUri: activeComposerUri,
                renderComposer: renderComposer
            }, void 0, false, {
                fileName: "[project]/src/components/comment-detail.tsx",
                lineNumber: 128,
                columnNumber: 7
            }, this),
            showChildren && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pl-6",
                children: comment.replies.map((r)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ReplyTree, {
                        comment: r,
                        depth: depth + 1,
                        onNavigate: onNavigate,
                        onLikeToggle: onLikeToggle,
                        onReply: onReply,
                        activeComposerUri: activeComposerUri,
                        renderComposer: renderComposer
                    }, r.uri, false, {
                        fileName: "[project]/src/components/comment-detail.tsx",
                        lineNumber: 140,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/comment-detail.tsx",
                lineNumber: 138,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/comment-detail.tsx",
        lineNumber: 127,
        columnNumber: 5
    }, this);
}
_c1 = ReplyTree;
function CommentDetail({ onClose, commentUri, onNavigateToComment, onNavigateToArgument, backLabel, registerScrollContainer }) {
    _s();
    const { isAuthenticated, loading: authLoading } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$AuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuth"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("commentDetail");
    const tc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("common");
    const te = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("errors");
    const [argument, setArgument] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [focalUri, setFocalUri] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    // Insurance in case the focal comment is missing from listComments().
    const [focalFallback, setFocalFallback] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const { comments, commentsLoading, toggleLike, submitComment, replyText, setReplyText, submitting, replyTarget, setReplyTarget, replyInputRef, commentError } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useCommentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCommentThread"])(argument?.uri, {
        onError: {
            "CommentDetail.useCommentThread": (e)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$toast$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["notifyPdsError"])(te, e)
        }["CommentDetail.useCommentThread"]
    });
    // Derive the thread spine (ancestors → focal → direct replies) from the
    // flat comment list. Likes/replies update the list, so this stays in sync.
    const { focalComment, ancestors, directReplies } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "CommentDetail.useMemo": ()=>{
            if (!focalUri) {
                return {
                    focalComment: null,
                    ancestors: [],
                    directReplies: []
                };
            }
            const map = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$commentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildCommentMap"])(comments, focalFallback);
            const focal = map.get(focalUri) ?? null;
            return {
                focalComment: focal,
                ancestors: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$commentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildAncestorChain"])(map, focalUri),
                directReplies: focal?.replies ?? []
            };
        }
    }["CommentDetail.useMemo"], [
        comments,
        focalUri,
        focalFallback
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommentDetail.useEffect": ()=>{
            if (authLoading) return;
            if (!isAuthenticated) router.push("/");
        }
    }["CommentDetail.useEffect"], [
        isAuthenticated,
        authLoading,
        router
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommentDetail.useEffect": ()=>{
            if (!isAuthenticated || authLoading || !commentUri) return;
            ({
                "CommentDetail.useEffect": async ()=>{
                    setLoading(true);
                    setError("");
                    try {
                        // Nur Argument-Info + Fokus-Kommentar laden; die flache Kommentarliste
                        // holt `useCommentThread` selbst (Query keyed auf `argument.uri`).
                        const { comment, argument: arg } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getComment"])(commentUri);
                        setArgument(arg);
                        setFocalUri(comment.uri);
                        setFocalFallback(comment);
                    } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to load comment");
                    } finally{
                        setLoading(false);
                    }
                }
            })["CommentDetail.useEffect"]();
        }
    }["CommentDetail.useEffect"], [
        isAuthenticated,
        authLoading,
        commentUri
    ]);
    // Leerer Thread → Composer unter dem Fokus-Kommentar direkt öffnen. Einmal je
    // Fokus, sobald die Kommentarliste geladen ist.
    const composerInitFor = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CommentDetail.useEffect": ()=>{
            if (!focalUri || commentsLoading) return;
            if (composerInitFor.current === focalUri) return;
            composerInitFor.current = focalUri;
            const hasReplies = comments.some({
                "CommentDetail.useEffect.hasReplies": (c)=>c.parentUri === focalUri
            }["CommentDetail.useEffect.hasReplies"]);
            setReplyTarget(hasReplies ? null : focalUri);
        }
    }["CommentDetail.useEffect"], [
        focalUri,
        commentsLoading,
        comments,
        setReplyTarget
    ]);
    const handleNavigateToArgument = ()=>{
        if (!argument) return;
        onNavigateToArgument(argument.rkey);
    };
    const handleSubmitReply = ()=>{
        if (!argument || !focalUri) return;
        submitComment(argument.uri, replyTarget ?? focalUri);
    };
    if (authLoading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-center justify-center min-h-[50vh] gap-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Spinner"], {}, void 0, false, {
                    fileName: "[project]/src/components/comment-detail.tsx",
                    lineNumber: 293,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "text-muted-foreground",
                    children: tc("restoringSession")
                }, void 0, false, {
                    fileName: "[project]/src/components/comment-detail.tsx",
                    lineNumber: 294,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/comment-detail.tsx",
            lineNumber: 292,
            columnNumber: 7
        }, this);
    }
    if (!isAuthenticated) return null;
    const loaded = !loading && !!focalComment && !!argument;
    const renderComposer = ()=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-2",
            children: [
                commentError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Alert"], {
                    variant: "destructive",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDescription"], {
                        children: te((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$pdsError$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pdsErrorKey"])(commentError))
                    }, void 0, false, {
                        fileName: "[project]/src/components/comment-detail.tsx",
                        lineNumber: 306,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/comment-detail.tsx",
                    lineNumber: 305,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$reply$2d$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ReplyInput"], {
                    ref: replyInputRef,
                    value: replyText,
                    onChange: setReplyText,
                    onSubmit: handleSubmitReply,
                    submitting: submitting,
                    placeholder: t("replyPlaceholder"),
                    onCancel: ()=>{
                        setReplyText("");
                        setReplyTarget(null);
                    }
                }, void 0, false, {
                    fileName: "[project]/src/components/comment-detail.tsx",
                    lineNumber: 309,
                    columnNumber: 7
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/comment-detail.tsx",
            lineNumber: 303,
            columnNumber: 5
        }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: registerScrollContainer,
        className: "h-full overflow-y-auto flex flex-col bg-[#fff8ef] rounded-2xl shadow-[0_30px_70px_-20px_rgba(45,35,22,0.45)]",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "sticky top-0 z-10 bg-[#fff8ef]/95 backdrop-blur-sm border-b flex items-center px-5 py-3",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: onClose,
                    className: "flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-base leading-none",
                            children: "←"
                        }, void 0, false, {
                            fileName: "[project]/src/components/comment-detail.tsx",
                            lineNumber: 335,
                            columnNumber: 11
                        }, this),
                        backLabel
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/comment-detail.tsx",
                    lineNumber: 331,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/comment-detail.tsx",
                lineNumber: 330,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "px-5 py-5 space-y-5",
                children: [
                    error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Alert"], {
                        variant: "destructive",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDescription"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: [
                                        tc("error"),
                                        ":"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/comment-detail.tsx",
                                    lineNumber: 345,
                                    columnNumber: 15
                                }, this),
                                " ",
                                error
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/comment-detail.tsx",
                            lineNumber: 344,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/comment-detail.tsx",
                        lineNumber: 343,
                        columnNumber: 11
                    }, this),
                    loading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-center py-16 gap-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Spinner"], {}, void 0, false, {
                                fileName: "[project]/src/components/comment-detail.tsx",
                                lineNumber: 352,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-muted-foreground",
                                children: t("loadingComment")
                            }, void 0, false, {
                                fileName: "[project]/src/components/comment-detail.tsx",
                                lineNumber: 353,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/comment-detail.tsx",
                        lineNumber: 351,
                        columnNumber: 11
                    }, this),
                    loaded && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                "data-overlay-anchor": argument.rkey,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$argument$2d$summary$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ArgumentSummary"], {
                                    title: argument.title,
                                    body: argument.body,
                                    type: argument.type,
                                    likeCount: argument.likeCount,
                                    commentCount: argument.commentCount,
                                    peerreviewStatus: argument.peerreviewStatus,
                                    clampBody: true,
                                    onClick: handleNavigateToArgument
                                }, void 0, false, {
                                    fileName: "[project]/src/components/comment-detail.tsx",
                                    lineNumber: 362,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/comment-detail.tsx",
                                lineNumber: 361,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    ancestors.map((ancestor, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PostRow, {
                                            comment: ancestor,
                                            clickable: true,
                                            clamp: true,
                                            showLineTop: idx > 0,
                                            showLineBottom: true,
                                            onNavigate: onNavigateToComment,
                                            onLikeToggle: toggleLike,
                                            onReply: setReplyTarget,
                                            activeComposerUri: replyTarget,
                                            renderComposer: renderComposer
                                        }, ancestor.uri, false, {
                                            fileName: "[project]/src/components/comment-detail.tsx",
                                            lineNumber: 377,
                                            columnNumber: 17
                                        }, this)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PostRow, {
                                        comment: focalComment,
                                        focal: true,
                                        showLineTop: ancestors.length > 0,
                                        onLikeToggle: toggleLike,
                                        onReply: setReplyTarget,
                                        activeComposerUri: replyTarget,
                                        renderComposer: renderComposer
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/comment-detail.tsx",
                                        lineNumber: 392,
                                        columnNumber: 15
                                    }, this),
                                    directReplies.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3",
                                                children: [
                                                    t("replies"),
                                                    " (",
                                                    directReplies.length,
                                                    ")"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/comment-detail.tsx",
                                                lineNumber: 405,
                                                columnNumber: 19
                                            }, this),
                                            directReplies.map((reply)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ReplyTree, {
                                                    comment: reply,
                                                    depth: 0,
                                                    onNavigate: onNavigateToComment,
                                                    onLikeToggle: toggleLike,
                                                    onReply: setReplyTarget,
                                                    activeComposerUri: replyTarget,
                                                    renderComposer: renderComposer
                                                }, reply.uri, false, {
                                                    fileName: "[project]/src/components/comment-detail.tsx",
                                                    lineNumber: 409,
                                                    columnNumber: 21
                                                }, this))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/comment-detail.tsx",
                                        lineNumber: 404,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/comment-detail.tsx",
                                lineNumber: 374,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/comment-detail.tsx",
                lineNumber: 341,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/comment-detail.tsx",
        lineNumber: 325,
        columnNumber: 5
    }, this);
}
_s(CommentDetail, "CrIgHaflHlbINXjGFeydIk8YCDU=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$AuthContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuth"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useCommentThread$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCommentThread"]
    ];
});
_c2 = CommentDetail;
var _c, _c1, _c2;
__turbopack_context__.k.register(_c, "PostRow");
__turbopack_context__.k.register(_c1, "ReplyTree");
__turbopack_context__.k.register(_c2, "CommentDetail");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/pro-contra-column-headers.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ProContraColumnHeaders",
    ()=>ProContraColumnHeaders
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
// Spaltenkopf für die Pro-/Contra-Spalten der Argumentlisten:
// kleines Versal-Label in der jeweiligen Farbe, eine dünne, auslaufende
// Trennlinie und rechts eine weiche Zähler-Pille. Bewusst zurückgenommen,
// damit es die Sektionsüberschrift nicht überstrahlt.
function ColumnHeader({ type, label, count }) {
    const isPro = type === "pro";
    const color = isPro ? "var(--pro)" : "var(--contra)";
    const dim = isPro ? "var(--pro-dim)" : "var(--contra-dim)";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center gap-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "shrink-0 text-[0.8125rem] font-bold uppercase tracking-[0.08em]",
                style: {
                    color
                },
                children: label
            }, void 0, false, {
                fileName: "[project]/src/components/pro-contra-column-headers.tsx",
                lineNumber: 24,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "h-px flex-1",
                style: {
                    background: `linear-gradient(to right, ${color}, transparent)`
                }
            }, void 0, false, {
                fileName: "[project]/src/components/pro-contra-column-headers.tsx",
                lineNumber: 30,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "shrink-0 text-xs font-bold rounded-[var(--r-full,999px)] px-2.5 py-1",
                style: {
                    backgroundColor: dim,
                    color
                },
                children: count
            }, void 0, false, {
                fileName: "[project]/src/components/pro-contra-column-headers.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/pro-contra-column-headers.tsx",
        lineNumber: 23,
        columnNumber: 5
    }, this);
}
_c = ColumnHeader;
function ProContraColumnHeaders({ proCount, contraCount }) {
    _s();
    const tc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("common");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "na-section-col-headers grid grid-cols-2 gap-4 mt-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ColumnHeader, {
                type: "pro",
                label: tc("pro"),
                count: proCount
            }, void 0, false, {
                fileName: "[project]/src/components/pro-contra-column-headers.tsx",
                lineNumber: 57,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ColumnHeader, {
                type: "contra",
                label: tc("contra"),
                count: contraCount
            }, void 0, false, {
                fileName: "[project]/src/components/pro-contra-column-headers.tsx",
                lineNumber: 58,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/pro-contra-column-headers.tsx",
        lineNumber: 56,
        columnNumber: 5
    }, this);
}
_s(ProContraColumnHeaders, "F6XHUGJHwar362l4a3QmyWpZGVo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c1 = ProContraColumnHeaders;
var _c, _c1;
__turbopack_context__.k.register(_c, "ColumnHeader");
__turbopack_context__.k.register(_c1, "ProContraColumnHeaders");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ui/card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Card",
    ()=>Card,
    "CardAction",
    ()=>CardAction,
    "CardContent",
    ()=>CardContent,
    "CardDescription",
    ()=>CardDescription,
    "CardFooter",
    ()=>CardFooter,
    "CardHeader",
    ()=>CardHeader,
    "CardTitle",
    ()=>CardTitle
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
;
;
function Card({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/card.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
_c = Card;
function CardHeader({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-header",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/card.tsx",
        lineNumber: 20,
        columnNumber: 5
    }, this);
}
_c1 = CardHeader;
function CardTitle({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-title",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("leading-none font-semibold", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/card.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
_c2 = CardTitle;
function CardDescription({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-description",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-sm text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/card.tsx",
        lineNumber: 43,
        columnNumber: 5
    }, this);
}
_c3 = CardDescription;
function CardAction({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-action",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/card.tsx",
        lineNumber: 53,
        columnNumber: 5
    }, this);
}
_c4 = CardAction;
function CardContent({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-content",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("px-6", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/card.tsx",
        lineNumber: 66,
        columnNumber: 5
    }, this);
}
_c5 = CardContent;
function CardFooter({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "card-footer",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex items-center px-6 [.border-t]:pt-6", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/card.tsx",
        lineNumber: 76,
        columnNumber: 5
    }, this);
}
_c6 = CardFooter;
;
var _c, _c1, _c2, _c3, _c4, _c5, _c6;
__turbopack_context__.k.register(_c, "Card");
__turbopack_context__.k.register(_c1, "CardHeader");
__turbopack_context__.k.register(_c2, "CardTitle");
__turbopack_context__.k.register(_c3, "CardDescription");
__turbopack_context__.k.register(_c4, "CardAction");
__turbopack_context__.k.register(_c5, "CardContent");
__turbopack_context__.k.register(_c6, "CardFooter");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/taxonomy-view.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ArgumentCard",
    ()=>ArgumentCard,
    "LeaningDot",
    ()=>LeaningDot,
    "PAGE_LIMIT",
    ()=>PAGE_LIMIT,
    "ProContraArguments",
    ()=>ProContraArguments,
    "ThemeCard",
    ()=>ThemeCard,
    "getInsight",
    ()=>getInsight
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Geteilte Render-Bausteine der Taxonomy-Darstellung — genutzt von der
 * Haupt-View (`…/arguments/taxonomy/page.tsx`) UND vom Taxonomy-Detail-Overlay
 * (`taxonomy-detail.tsx`), damit beide identisch aussehen.
 *
 * Enthält: `getInsight` (leitet Farbe/Zustand eines Knotens aus den Bewertungen
 * ab — treibt die Card-Farbcodierung), die Booklet-artige Argument-Karte
 * (ArgumentCard) und die zweispaltige Pro/Contra-Liste mit „Mehr anzeigen"-Limit
 * (ProContraArguments).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$dashed$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleDashed$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-dashed.js [app-client] (ecmascript) <export default as CircleDashed>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$split$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Split$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/split.js [app-client] (ecmascript) <export default as Split>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$thumbs$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ThumbsUp$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/thumbs-up.js [app-client] (ecmascript) <export default as ThumbsUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$thumbs$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ThumbsDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/thumbs-down.js [app-client] (ecmascript) <export default as ThumbsDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scale$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Scale$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/scale.js [app-client] (ecmascript) <export default as Scale>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/plus.js [app-client] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$telescope$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Telescope$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/telescope.js [app-client] (ecmascript) <export default as Telescope>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-client] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Star$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/star.js [app-client] (ecmascript) <export default as Star>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pro$2d$contra$2d$column$2d$headers$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/pro-contra-column-headers.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/tooltip.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
const PAGE_LIMIT = 4;
// „Peek": Maske, die den angeschnittenen Kopf der nächsten (ausgeblendeten)
// Karte nach unten ausblendet — signalisiert „die Liste geht weiter" ohne dass
// man die Restkarte vollständig zeigt. Höhe so gewählt, dass Badge + ein Hauch
// Titel sichtbar bleiben (na-card: 16px Padding + Badge-Zeile).
const PEEK_MASK = "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)";
// Bottom-Aktion der ThemeCard — Material-„Text Button": farbiger Text + Icon,
// keine Füllung/Rand. Beide Aktionen identisch (kein Emphasis-Unterschied).
// Monochrom (gedämpftes Vordergrund-Grau) — neutral statt warmem Amber, damit
// die Aktion nicht versehentlich nach Contra-Rot aussieht.
const ACTION_BTN = "flex max-w-full items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-foreground/70 transition hover:bg-foreground/[0.06] hover:text-foreground";
// ---------------------------------------------------------------------------
// „Für dich"-Insight: Zustand aus proLeaning / dissent / ratedCount ableiten.
// ---------------------------------------------------------------------------
const THRESHOLD = 0.12;
const SPLIT = 0.5;
const MIN_RATED = 2;
const COL_GREY = "rgb(148,163,184)";
const COL_AMBER = "rgb(217,159,40)";
const COL_BLUE = "rgb(37,99,235)";
const COL_RED = "rgb(178,58,33)";
function getInsight(node, t) {
    const rated = node.ratedCount ?? 0;
    const lean = node.proLeaning;
    const dissent = node.dissent ?? 0;
    let state;
    if (lean == null || rated < MIN_RATED) state = "unrated";
    else if (dissent > SPLIT) state = "split";
    else if (lean > THRESHOLD) state = "pro";
    else if (lean < -THRESHOLD) state = "contra";
    else state = "balanced";
    const map = {
        unrated: {
            bar: COL_GREY,
            bg: "rgba(0,0,0,0.02)",
            Icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$dashed$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleDashed$3e$__["CircleDashed"],
            title: t("insUnrTitle"),
            sub: t("insUnrSub")
        },
        split: {
            bar: COL_AMBER,
            bg: "rgba(217,159,40,0.07)",
            Icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$split$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Split$3e$__["Split"],
            title: t("insSplitTitle"),
            sub: t("insSplitSub")
        },
        pro: {
            bar: COL_BLUE,
            bg: "rgba(37,99,235,0.05)",
            Icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$thumbs$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ThumbsUp$3e$__["ThumbsUp"],
            title: t("insProTitle"),
            sub: t("insProSub")
        },
        contra: {
            bar: COL_RED,
            bg: "rgba(178,58,33,0.05)",
            Icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$thumbs$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ThumbsDown$3e$__["ThumbsDown"],
            title: t("insConTitle"),
            sub: t("insConSub")
        },
        balanced: {
            bar: COL_GREY,
            bg: "rgba(0,0,0,0.02)",
            Icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scale$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Scale$3e$__["Scale"],
            title: t("insBalTitle"),
            sub: t("insBalSub")
        }
    };
    return {
        state,
        ...map[state]
    };
}
function LeaningDot({ lean }) {
    const bg = lean == null ? COL_GREY : lean > THRESHOLD ? COL_BLUE : lean < -THRESHOLD ? COL_RED : COL_AMBER;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: "inline-block h-2 w-2 shrink-0 rounded-full",
        style: {
            background: bg
        }
    }, void 0, false, {
        fileName: "[project]/src/components/taxonomy-view.tsx",
        lineNumber: 98,
        columnNumber: 10
    }, this);
}
_c = LeaningDot;
function ArgumentCard({ arg, onOpen }) {
    _s();
    const tbk = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("booklet");
    const trs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("reviewStatus");
    const isPro = arg.type === "PRO";
    const relevance = typeof arg.viewerPreference === "number" ? arg.viewerPreference : null;
    const rated = relevance !== null;
    const isOfficial = arg.sourceType === "official";
    // Pol-Farbe (Pro = Blau, Contra = Terrakotta) trägt jetzt die Pro/Contra-Info,
    // da der Badge entfällt: linker Rand, Balkenfüllung und Zahl.
    const accent = isPro ? "var(--pro)" : "var(--contra)";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        onClick: ()=>onOpen(arg.rkey),
        onKeyDown: (e)=>{
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(arg.rkey);
            }
        },
        role: "button",
        tabIndex: 0,
        style: {
            borderLeft: `4px solid ${accent}`
        },
        className: `flex cursor-pointer flex-col gap-2.5 rounded-xl border border-[var(--line)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-150 hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(0,0,0,0.07)] ${rated ? "bg-white" : "bg-[var(--brand-dim)]"}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-start justify-between gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                        className: "min-w-0 flex-1 text-[1.1875rem] font-normal leading-snug tracking-tight text-[var(--text)] [overflow-wrap:anywhere]",
                        style: {
                            fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif'
                        },
                        children: arg.title
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 139,
                        columnNumber: 9
                    }, this),
                    isOfficial && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                asChild: true,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "mt-0.5 inline-flex shrink-0 cursor-help items-center gap-1 text-[0.6875rem] font-semibold text-[#8a6b2b]",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Star$3e$__["Star"], {
                                            className: "h-3 w-3",
                                            "aria-hidden": true
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/taxonomy-view.tsx",
                                            lineNumber: 149,
                                            columnNumber: 17
                                        }, this),
                                        trs("official")
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/taxonomy-view.tsx",
                                    lineNumber: 148,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 147,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                className: "max-w-xs",
                                children: trs("officialTooltip")
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 153,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 146,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/taxonomy-view.tsx",
                lineNumber: 138,
                columnNumber: 7
            }, this),
            rated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col gap-1",
                "aria-label": `${tbk("yourRating")}: ${relevance}/100`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-[var(--line)]",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "h-full rounded-full",
                                    style: {
                                        width: `${relevance}%`,
                                        background: accent
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-view.tsx",
                                    lineNumber: 168,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 167,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "shrink-0 text-[0.8125rem] font-bold tabular-nums",
                                style: {
                                    color: accent
                                },
                                children: [
                                    relevance,
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-normal text-[var(--text-faint)]",
                                        children: "/100"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-view.tsx",
                                        lineNumber: 178,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 173,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 166,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[0.6875rem] text-[var(--text-faint)]",
                        children: tbk("yourRating")
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 181,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/taxonomy-view.tsx",
                lineNumber: 162,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col gap-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        className: "invisible text-[0.8125rem] font-bold",
                        children: "0"
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 189,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[0.6875rem] font-semibold text-[var(--brand)]",
                        children: tbk("rateNow")
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 192,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/taxonomy-view.tsx",
                lineNumber: 186,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/taxonomy-view.tsx",
        lineNumber: 121,
        columnNumber: 5
    }, this);
}
_s(ArgumentCard, "CCR9WSSmwRuvn92Jclz1GeTmeqQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c1 = ArgumentCard;
function ProContraArguments({ args, onOpen, onShowMore, limit = PAGE_LIMIT, hideShowMore = false }) {
    _s1();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("taxonomy");
    const [expanded, setExpanded] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    if (!args.length) return null;
    const pro = args.filter((a)=>a.type === "PRO");
    const contra = args.filter((a)=>a.type !== "PRO");
    const cap = expanded ? Infinity : limit;
    const visiblePro = pro.slice(0, cap);
    const visibleContra = contra.slice(0, cap);
    // Verbleibende (ausgeblendete) Karten über beide Spalten.
    const remaining = pro.length - visiblePro.length + (contra.length - visibleContra.length);
    const hasMore = remaining > 0;
    const handleMore = onShowMore ?? (()=>setExpanded(true));
    // Mobile (einspaltig): flache Liste in Original-`args`-Reihenfolge (Backend
    // liefert bereits „offiziell zuerst, dann geseedet gemischt"). Gleiche
    // Sichtbarkeits-Mathe wie der Desktop-Zweispalter, damit der geteilte
    // „Mehr anzeigen"-Button in beiden Layouts denselben Count zeigt.
    const visibleCount = visiblePro.length + visibleContra.length;
    const flatVisible = args.slice(0, visibleCount);
    const flatPeek = !expanded && args.length > visibleCount ? args[visibleCount] : null;
    // Eine Spalte: sichtbare Karten + (falls noch welche ausgeblendet sind) der
    // angeschnittene „Peek" der nächsten Karte als rein visueller Vorgeschmack.
    const renderColumn = (items)=>{
        const visible = items.slice(0, cap);
        const peek = !expanded && items.length > visible.length ? items[visible.length] : null;
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex flex-col gap-4",
            children: [
                visible.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ArgumentCard, {
                        arg: a,
                        onOpen: onOpen
                    }, a.uri, false, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 251,
                        columnNumber: 29
                    }, this)),
                peek && // Nur im Zweispalter (md+): Peek am unteren Rand jeder Spalte. Die
                // mobile flache Liste hat ihren eigenen Peek (flatPeek).
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    "aria-hidden": true,
                    className: "relative hidden h-[3.25rem] overflow-hidden md:block",
                    style: {
                        maskImage: PEEK_MASK,
                        WebkitMaskImage: PEEK_MASK
                    },
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pointer-events-none",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ArgumentCard, {
                            arg: peek,
                            onOpen: ()=>{}
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-view.tsx",
                            lineNumber: 261,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 260,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-view.tsx",
                    lineNumber: 255,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/taxonomy-view.tsx",
            lineNumber: 250,
            columnNumber: 7
        }, this);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "hidden md:block",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pro$2d$contra$2d$column$2d$headers$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ProContraColumnHeaders"], {
                    proCount: pro.length,
                    contraCount: contra.length
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-view.tsx",
                    lineNumber: 274,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/taxonomy-view.tsx",
                lineNumber: 273,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-3 hidden gap-4 md:grid md:grid-cols-2",
                children: [
                    renderColumn(pro),
                    renderColumn(contra)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/taxonomy-view.tsx",
                lineNumber: 277,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-3 flex flex-col gap-4 md:hidden",
                children: [
                    flatVisible.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ArgumentCard, {
                            arg: a,
                            onOpen: onOpen
                        }, a.uri, false, {
                            fileName: "[project]/src/components/taxonomy-view.tsx",
                            lineNumber: 285,
                            columnNumber: 11
                        }, this)),
                    flatPeek && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        "aria-hidden": true,
                        className: "relative h-[3.25rem] overflow-hidden",
                        style: {
                            maskImage: PEEK_MASK,
                            WebkitMaskImage: PEEK_MASK
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "pointer-events-none",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ArgumentCard, {
                                arg: flatPeek,
                                onOpen: ()=>{}
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 294,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-view.tsx",
                            lineNumber: 293,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 288,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/taxonomy-view.tsx",
                lineNumber: 283,
                columnNumber: 7
            }, this),
            hasMore && !hideShowMore && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-3 flex justify-center",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    className: ACTION_BTN,
                    onClick: handleMore,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                            className: "h-4 w-4 shrink-0"
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-view.tsx",
                            lineNumber: 302,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "truncate",
                            children: t("showMore", {
                                count: remaining
                            })
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-view.tsx",
                            lineNumber: 303,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-view.tsx",
                    lineNumber: 301,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/taxonomy-view.tsx",
                lineNumber: 300,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/taxonomy-view.tsx",
        lineNumber: 270,
        columnNumber: 5
    }, this);
}
_s1(ProContraArguments, "lRrtTxyi3DP44/yYvlCwOpTmaRM=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c2 = ProContraArguments;
function ThemeCard({ node, onOpen, onShowMore, onAddArgument, subtopic = false, index, total, t, limit = 2 }) {
    const rated = node.ratedCount ?? 0;
    // Bottom-Aktion (nur Haupt-View, d. h. wenn onAddArgument geliefert wird):
    //  - alle Argumente sichtbar  ⇒ „Neues Argument vorschlagen" (Modal)
    //  - nicht alle (wegen Limit)  ⇒ „Mehr zum Themenfeld …" (öffnet das Overlay).
    // Gate: erst freigeben, wenn der Nutzer genügend Argumente bewertet hat. Ziel
    // sind 2 Bewertungen — hat das Thema aber nur 1 Argument, muss eben dieses 1
    // bewertet sein (sonst käme der Button bei 1 Argument fälschlich sofort).
    // 0 Argumente ⇒ kein Gate (man darf das erste Argument vorschlagen).
    const managed = !!onAddArgument;
    const proCount = node.arguments.filter((a)=>a.type === "PRO").length;
    const contraCount = node.arguments.length - proCount;
    const truncated = proCount > limit || contraCount > limit;
    const ratedArgs = node.arguments.filter((a)=>typeof a.viewerPreference === "number").length;
    const ratingTarget = Math.min(2, node.arguments.length);
    const needsRating = ratedArgs < ratingTarget;
    // „overlay" = Drilldown-Link in die nächste Stufe. Haupt-View (managed): nur
    // wenn gekürzt wird, sonst „+ Argument". Overlay (nicht managed): immer, sobald
    // ein onShowMore-Ziel existiert (= das Unterthema hat eigene Unterthemen) —
    // unabhängig davon, ob gekürzt wird. Blatt-Unterthemen (kein onShowMore) zeigen
    // stattdessen den inline „Mehr anzeigen"-Button aus ProContraArguments.
    const footer = managed ? needsRating ? "hint" : truncated ? onShowMore ? "overlay" : "none" : "add" : onShowMore ? "overlay" : "none";
    const hasFooter = footer !== "none";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
        className: "gap-0 overflow-hidden border-border/60 py-0 shadow-none",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0",
                        children: [
                            typeof total === "number" && total > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground",
                                children: t(subtopic ? "subthemeEyebrow" : "themeEyebrow", {
                                    index: (index ?? 0) + 1,
                                    total
                                })
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 387,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "truncate text-[1.0625rem] font-bold tracking-tight leading-snug",
                                style: {
                                    fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif'
                                },
                                children: node.name
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 394,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 383,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "mt-0.5 inline-flex shrink-0 items-center rounded-[var(--r-full)] bg-[var(--surface-up)] px-2.5 py-1 text-[0.6875rem] font-medium tabular-nums text-muted-foreground",
                        children: [
                            rated,
                            "/",
                            node.argumentCount,
                            " ",
                            t("rated")
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 404,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/taxonomy-view.tsx",
                lineNumber: 382,
                columnNumber: 7
            }, this),
            (node.introduction || node.arguments.length > 0) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `px-4 sm:px-6 ${hasFooter ? "pb-4" : "pb-5"}`,
                children: [
                    node.introduction && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mb-4 text-sm leading-relaxed text-muted-foreground",
                        children: node.introduction
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 412,
                        columnNumber: 13
                    }, this),
                    node.arguments.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProContraArguments, {
                        args: node.arguments,
                        onOpen: onOpen,
                        // Bei Footer-Drilldown („overlay") übernimmt der Link unten das
                        // Weiterblättern → inline „Mehr anzeigen" unterdrücken.
                        onShowMore: footer === "overlay" ? undefined : onShowMore,
                        limit: limit,
                        hideShowMore: managed || footer === "overlay"
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 417,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/taxonomy-view.tsx",
                lineNumber: 410,
                columnNumber: 9
            }, this),
            hasFooter && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex justify-center px-4 pb-5 sm:px-6",
                children: [
                    footer === "hint" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-center text-xs leading-snug text-muted-foreground",
                        children: t(node.arguments.length === 1 ? "rateFirstHintOne" : "rateFirstHint")
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 435,
                        columnNumber: 13
                    }, this),
                    footer === "add" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: onAddArgument,
                        className: ACTION_BTN,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                className: "h-4 w-4 shrink-0"
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 445,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "truncate",
                                children: t("newArgument")
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 446,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 444,
                        columnNumber: 13
                    }, this),
                    footer === "overlay" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: onShowMore,
                        className: ACTION_BTN,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$telescope$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Telescope$3e$__["Telescope"], {
                                className: "h-4 w-4 shrink-0"
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 451,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "truncate",
                                children: t(subtopic ? "openSubtopicArea" : "openTopicArea", {
                                    name: node.name
                                })
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-view.tsx",
                                lineNumber: 452,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/taxonomy-view.tsx",
                        lineNumber: 450,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/taxonomy-view.tsx",
                lineNumber: 433,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/taxonomy-view.tsx",
        lineNumber: 381,
        columnNumber: 5
    }, this);
}
_c3 = ThemeCard;
var _c, _c1, _c2, _c3;
__turbopack_context__.k.register(_c, "LeaningDot");
__turbopack_context__.k.register(_c1, "ArgumentCard");
__turbopack_context__.k.register(_c2, "ProContraArguments");
__turbopack_context__.k.register(_c3, "ThemeCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/taxonomy-detail.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TaxonomyDetail",
    ()=>TaxonomyDetail,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Taxonomy-Detail-Overlay — Detailseite eines einzelnen Top-Topics.
 *
 * Geöffnet aus der Taxonomy-Main-View über „Mehr anzeigen". Lädt die `topic`-
 * Variante von taxonomy.get (Top-Topic + seine Subtopics, jeweils mit allen
 * Argumenten des Teilbaums) und zeigt: Kopf des Top-Topics (Name, Beschreibung)
 * + dessen direkte Argumente + jedes Subtopic aufgeklappt.
 * Argumente sind je Sektion auf 4/Spalte begrenzt; „Mehr anzeigen" zeigt alle.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/queries/taxonomy.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/spinner.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$view$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/taxonomy-view.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function TaxonomyDetail({ ballotRkey, topic, onClose, backLabel, onNavigateToArgument, onNavigateToTaxonomy, registerScrollContainer }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("taxonomy");
    const ta = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("argumentarium");
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"])();
    // Topic-Variante aus dem zentralen Query-Cache. Bewertungen im Argument-Overlay
    // patchen denselben `["taxonomy", id, …]`-Eintrag → Karten aktualisieren live.
    const { data, isPending, error: queryError } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTaxonomyTopic"])(ballotRkey, locale, topic);
    const node = data?.tree ?? null;
    const crumbs = data?.breadcrumb ?? [];
    const loading = isPending;
    const error = queryError ? queryError instanceof Error ? queryError.message : String(queryError) : null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: registerScrollContainer,
        className: "flex h-full flex-col overflow-y-auto rounded-xl border border-border bg-background shadow-[0_30px_70px_-20px_rgba(45,35,22,0.45)]",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "sticky top-0 z-10 flex items-center border-b bg-background/95 px-5 py-3 backdrop-blur-sm",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: onClose,
                    className: "flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-base leading-none",
                            children: "←"
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-detail.tsx",
                            lineNumber: 70,
                            columnNumber: 11
                        }, this),
                        backLabel
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-detail.tsx",
                    lineNumber: 66,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/taxonomy-detail.tsx",
                lineNumber: 65,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-6 px-5 py-6 pb-[20vh]",
                children: [
                    loading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-center gap-3 py-16",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Spinner"], {}, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-detail.tsx",
                                lineNumber: 78,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-muted-foreground",
                                children: t("loading")
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-detail.tsx",
                                lineNumber: 79,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/taxonomy-detail.tsx",
                        lineNumber: 77,
                        columnNumber: 11
                    }, this),
                    error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-destructive",
                        children: error
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-detail.tsx",
                        lineNumber: 83,
                        columnNumber: 19
                    }, this),
                    !loading && !error && !node && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "py-16 text-center text-muted-foreground",
                        children: t("empty")
                    }, void 0, false, {
                        fileName: "[project]/src/components/taxonomy-detail.tsx",
                        lineNumber: 86,
                        columnNumber: 11
                    }, this),
                    !loading && node && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                                className: "space-y-3",
                                children: [
                                    crumbs.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                                        className: "flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground",
                                        children: crumbs.map((c, ci)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "flex items-center gap-x-1",
                                                children: [
                                                    ci > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "opacity-40",
                                                        children: "›"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/taxonomy-detail.tsx",
                                                        lineNumber: 100,
                                                        columnNumber: 34
                                                    }, this),
                                                    c.key ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        title: c.description ?? undefined,
                                                        onClick: ()=>onNavigateToTaxonomy(ballotRkey, c.key),
                                                        className: "hover:text-foreground hover:underline",
                                                        children: c.name
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/taxonomy-detail.tsx",
                                                        lineNumber: 102,
                                                        columnNumber: 25
                                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        title: c.description ?? undefined,
                                                        className: "cursor-default",
                                                        children: c.name
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/taxonomy-detail.tsx",
                                                        lineNumber: 113,
                                                        columnNumber: 25
                                                    }, this)
                                                ]
                                            }, ci, true, {
                                                fileName: "[project]/src/components/taxonomy-detail.tsx",
                                                lineNumber: 99,
                                                columnNumber: 21
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-detail.tsx",
                                        lineNumber: 97,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        className: "text-2xl md:text-[1.75rem] font-bold tracking-tight leading-tight",
                                        style: {
                                            fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif'
                                        },
                                        children: ta(node.children.length > 0 ? "subtopicsTitle" : "topicTitle", {
                                            name: node.name
                                        })
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-detail.tsx",
                                        lineNumber: 125,
                                        columnNumber: 15
                                    }, this),
                                    node.introduction && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm text-muted-foreground",
                                        children: node.introduction
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-detail.tsx",
                                        lineNumber: 138,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/taxonomy-detail.tsx",
                                lineNumber: 94,
                                columnNumber: 13
                            }, this),
                            node.arguments.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$view$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ProContraArguments"], {
                                args: node.arguments,
                                onOpen: onNavigateToArgument
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-detail.tsx",
                                lineNumber: 147,
                                columnNumber: 15
                            }, this),
                            node.children.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-col gap-3",
                                children: node.children.map((ch, i)=>{
                                    // Hat das Unterthema selbst Unterthemen? Dann Drilldown-Link
                                    // („Mehr zum Unterthema") in dessen Overlay (immer, auch wenn
                                    // nicht gekürzt). Sonst ist die Karte ein Blatt → Default-Limit
                                    // + inline „Mehr anzeigen (+N)".
                                    // In der Topic-Sicht ist `children` abgeflacht ([]); das Flag
                                    // `hasChildren` vom AppView trägt die echte Struktur-Info.
                                    const hasSub = ch.hasChildren ?? ch.children.length > 0;
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$view$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ThemeCard"], {
                                        node: ch,
                                        index: i,
                                        total: node.children.length,
                                        onOpen: onNavigateToArgument,
                                        onShowMore: hasSub && ch.key ? ()=>onNavigateToTaxonomy(ballotRkey, ch.key) : undefined,
                                        subtopic: true,
                                        t: t
                                    }, ch.id, false, {
                                        fileName: "[project]/src/components/taxonomy-detail.tsx",
                                        lineNumber: 166,
                                        columnNumber: 21
                                    }, this);
                                })
                            }, void 0, false, {
                                fileName: "[project]/src/components/taxonomy-detail.tsx",
                                lineNumber: 156,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/taxonomy-detail.tsx",
                lineNumber: 75,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/taxonomy-detail.tsx",
        lineNumber: 60,
        columnNumber: 5
    }, this);
}
_s(TaxonomyDetail, "uRLVdFBCW0XryPj1zh9DkgwutOg=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTaxonomyTopic"]
    ];
});
_c = TaxonomyDetail;
const __TURBOPACK__default__export__ = TaxonomyDetail;
var _c;
__turbopack_context__.k.register(_c, "TaxonomyDetail");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/overlay-content/overlay-content-host.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OverlayContentHost",
    ()=>OverlayContentHost
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/overlay/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$overlay$2d$host$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay/overlay-host.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$argument$2d$detail$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/argument-detail.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$comment$2d$detail$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/comment-detail.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$detail$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/taxonomy-detail.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function OverlayContentHost() {
    _s();
    const tc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("common");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$overlay$2d$host$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OverlayHost"], {
        closeLabel: tc("close"),
        backLabels: {
            argument: tc("backToArgument"),
            comment: tc("backToPost"),
            profile: tc("backToProfile"),
            peerreview: tc("backToPeerReview"),
            taxonomy: tc("backToTaxonomy")
        },
        titles: {
            argument: tc("overlayTitleArgument"),
            comment: tc("overlayTitleComment"),
            profile: tc("overlayTitleProfile"),
            peerreview: tc("overlayTitlePeerReview"),
            taxonomy: tc("overlayTitleTaxonomy")
        },
        children: (entry, ctx)=>renderEntry(entry, ctx)
    }, void 0, false, {
        fileName: "[project]/src/lib/overlay-content/overlay-content-host.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, this);
}
_s(OverlayContentHost, "F6XHUGJHwar362l4a3QmyWpZGVo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = OverlayContentHost;
function renderEntry(entry, ctx) {
    switch(entry.type){
        case "argument":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$argument$2d$detail$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ArgumentDetail"], {
                onClose: ctx.back,
                argRkey: entry.rkey,
                // The clicked element's identifier doubles as the anchor: on return
                // we look for `[data-overlay-anchor="<uri>"]` and scroll it into
                // view. Detail components annotate their clickable items.
                onNavigateToComment: (uri)=>ctx.navigate({
                        type: "comment",
                        uri
                    }, {
                        anchor: uri
                    }),
                onNavigateToTaxonomy: (ballotRkey, topic)=>ctx.navigate({
                        type: "taxonomy",
                        ballotRkey,
                        topic
                    }),
                backLabel: ctx.backLabel,
                registerScrollContainer: ctx.registerScrollContainer
            }, void 0, false, {
                fileName: "[project]/src/lib/overlay-content/overlay-content-host.tsx",
                lineNumber: 53,
                columnNumber: 9
            }, this);
        case "comment":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$comment$2d$detail$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommentDetail"], {
                onClose: ctx.back,
                commentUri: entry.uri,
                onNavigateToComment: (uri)=>ctx.navigate({
                        type: "comment",
                        uri
                    }, {
                        anchor: uri
                    }),
                onNavigateToArgument: (rkey)=>ctx.navigate({
                        type: "argument",
                        rkey
                    }, {
                        anchor: rkey
                    }),
                backLabel: ctx.backLabel,
                registerScrollContainer: ctx.registerScrollContainer
            }, void 0, false, {
                fileName: "[project]/src/lib/overlay-content/overlay-content-host.tsx",
                lineNumber: 71,
                columnNumber: 9
            }, this);
        case "taxonomy":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$detail$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TaxonomyDetail"], {
                ballotRkey: entry.ballotRkey,
                topic: entry.topic,
                onClose: ctx.back,
                backLabel: ctx.backLabel,
                onNavigateToArgument: (rkey)=>ctx.navigate({
                        type: "argument",
                        rkey
                    }, {
                        anchor: rkey
                    }),
                onNavigateToTaxonomy: (ballotRkey, topic)=>ctx.navigate({
                        type: "taxonomy",
                        ballotRkey,
                        topic
                    }),
                registerScrollContainer: ctx.registerScrollContainer
            }, void 0, false, {
                fileName: "[project]/src/lib/overlay-content/overlay-content-host.tsx",
                lineNumber: 86,
                columnNumber: 9
            }, this);
        case "profile":
            // Placeholder — profile component not yet implemented.
            return null;
        case "peerreview":
            // Placeholder — peer-review overlay arrives later. Stack/back/scroll
            // already work; only the visible body is missing.
            return null;
    }
}
var _c;
__turbopack_context__.k.register(_c, "OverlayContentHost");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/overlay-content/index.ts [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2d$content$2f$overlay$2d$content$2d$host$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay-content/overlay-content-host.tsx [app-client] (ecmascript)");
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(app)/ballot/[id]/layout.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>VorlageLayout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/arrow-left.js [app-client] (ecmascript) <export default as ArrowLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/overlay/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay/context.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2d$content$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/overlay-content/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2d$content$2f$overlay$2d$content$2d$host$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay-content/overlay-content-host.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
;
;
const tabs = [
    {
        key: "info",
        segment: "info"
    },
    {
        key: "chat",
        segment: "chat"
    },
    {
        key: "arguments",
        segment: "arguments"
    }
];
function VorlageLayout({ children }) {
    _s();
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"])();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const id = params.id;
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"])();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("vorlage");
    const tbt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("ballotType");
    // Geteilter Cache mit den Content-Seiten (info/booklet/taxonomy nutzen denselben
    // queryKey), daher kein zusätzlicher Request im Normalfall.
    const { data: ballot } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "ballot",
            id,
            locale
        ],
        queryFn: {
            "VorlageLayout.useQuery": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getBallot"])(id, locale)
        }["VorlageLayout.useQuery"]
    });
    const activeSegment = tabs.find((tab)=>pathname.startsWith(`/ballot/${id}/${tab.segment}`))?.segment;
    return(// OverlayProvider scoped to /ballot/[id]/* — overlays (argument, comment,
    // profile, peerreview) are only available within a ballot context where
    // useParams().id resolves to the current ballotRkey.
    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$context$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OverlayProvider"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-1 flex-col",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mx-auto w-full",
                        style: {
                            maxWidth: "var(--page-max)",
                            padding: "0 var(--page-px)"
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-between gap-4 pt-5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        href: "/home",
                                        className: "flex items-center gap-1 text-[0.8125rem] text-[var(--text-mid)] hover:text-[var(--text)] transition-colors no-underline shrink-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                                                className: "h-3.5 w-3.5"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                                                lineNumber: 59,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: t("backToHome")
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                                                lineNumber: 60,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                                        lineNumber: 55,
                                        columnNumber: 13
                                    }, this),
                                    ballot && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-2 min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "label truncate",
                                                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatDate"])(ballot.voteDate)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                                                lineNumber: 65,
                                                columnNumber: 17
                                            }, this),
                                            ballot.ballotType && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "label",
                                                        children: "·"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                                                        lineNumber: 70,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-[0.8125rem] font-semibold text-[var(--brand)] truncate",
                                                        children: tbt(ballot.ballotType)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                                                        lineNumber: 71,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                                        lineNumber: 64,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                                lineNumber: 54,
                                columnNumber: 11
                            }, this),
                            ballot?.title && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                className: "mt-7 mb-4 text-3xl md:text-[2.25rem] font-normal tracking-tight leading-[0.95]",
                                style: {
                                    fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif'
                                },
                                children: ballot.title
                            }, void 0, false, {
                                fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                                lineNumber: 81,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                        lineNumber: 50,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                        className: "sticky top-[59px] z-40 border-b border-[#E0DCD1] bg-[var(--bg)]",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mx-auto flex h-11 items-stretch gap-6 overflow-x-auto",
                            style: {
                                maxWidth: "var(--page-max)",
                                padding: "0 var(--page-px)"
                            },
                            children: tabs.map((tab)=>{
                                const href = `/ballot/${id}/${tab.segment}`;
                                const isActive = activeSegment === tab.segment;
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    href: href,
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("inline-flex items-center border-b-2 text-[0.8125rem] no-underline transition-colors whitespace-nowrap", isActive ? "border-[var(--text)] font-semibold text-[var(--text)]" : "border-transparent font-medium text-[var(--text-mid)] hover:text-[var(--text)]"),
                                    children: t(tab.key)
                                }, tab.segment, false, {
                                    fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                                    lineNumber: 111,
                                    columnNumber: 17
                                }, this);
                            })
                        }, void 0, false, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                            lineNumber: 97,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                        lineNumber: 96,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mx-auto w-full max-w-[var(--page-max)] flex-1",
                        style: {
                            padding: "0 var(--page-px) 6rem"
                        },
                        children: children
                    }, void 0, false, {
                        fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                        lineNumber: 130,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2d$content$2f$overlay$2d$content$2d$host$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OverlayContentHost"], {}, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
                lineNumber: 137,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(app)/ballot/[id]/layout.tsx",
        lineNumber: 46,
        columnNumber: 5
    }, this));
}
_s(VorlageLayout, "S54HRRkQQhZgeYyzYnmqKsWZHVs=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
_c = VorlageLayout;
var _c;
__turbopack_context__.k.register(_c, "VorlageLayout");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_7bec328f._.js.map