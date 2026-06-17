module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/src/lib/appview-proxy.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ─── Forward the real client IP to the AppView ───────────────────────────────
// All user XRPC traffic is proxied through these Next.js API routes, so the
// AppView would otherwise see every request as coming from THIS frontend pod's
// IP — collapsing every user into one rate-limit bucket. We forward the real
// browser IP so the AppView's limiter can key per-client.
//
// The IP is only honoured by the AppView when accompanied by the shared
// APPVIEW_PROXY_SECRET, so a caller hitting the AppView directly cannot spoof
// X-Poltr-Client-IP to forge or evade limits. See doc/SECURITY_AUTH.md #1.
__turbopack_context__.s([
    "appviewForwardHeaders",
    ()=>appviewForwardHeaders,
    "clientIpFrom",
    ()=>clientIpFrom
]);
const PROXY_SECRET = process.env.APPVIEW_PROXY_SECRET || "";
function clientIpFrom(request) {
    const xff = request.headers.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    return first || request.headers.get("x-real-ip");
}
function appviewForwardHeaders(request) {
    const ip = clientIpFrom(request);
    if (!ip || !PROXY_SECRET) return {};
    return {
        "X-Poltr-Client-IP": ip,
        "X-Poltr-Proxy-Secret": PROXY_SECRET
    };
}
}),
"[project]/src/app/api/xrpc/[...path]/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$appview$2d$proxy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/appview-proxy.ts [app-route] (ecmascript)");
;
;
const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const EID_VERIFICATION_ENABLED = ("TURBOPACK compile-time value", "false") === 'true';
async function proxyRequest(request, { params }) {
    const { path } = await params;
    const xrpcPath = path.join('/');
    if (!EID_VERIFICATION_ENABLED && xrpcPath === 'ch.poltr.auth.initiateEidVerification') {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'feature_disabled',
            message: 'E-ID verification is not enabled'
        }, {
            status: 403
        });
    }
    const url = new URL(`${APPVIEW_URL}/xrpc/${xrpcPath}`);
    // Forward query parameters
    request.nextUrl.searchParams.forEach((value, key)=>{
        url.searchParams.set(key, value);
    });
    // Reflect the in-app language switch: inject ?lang from the `locale` cookie
    // (set by the locale switcher) unless the caller already passed one. The
    // AppView prefers ?lang over Accept-Language, so this localizes arguments and
    // comments to the chosen UI language without touching every call site.
    if (!url.searchParams.has('lang')) {
        const locale = request.cookies.get('locale')?.value;
        if (locale) url.searchParams.set('lang', locale);
    }
    // Start with the real-client-IP forwarding headers (secret-gated) so the
    // AppView rate limiter keys per-client, not per frontend-pod.
    const headers = {
        ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$appview$2d$proxy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["appviewForwardHeaders"])(request)
    };
    // Forward content-type if present
    const contentType = request.headers.get('content-type');
    if (contentType) {
        headers['Content-Type'] = contentType;
    }
    // Read session cookie and forward as Bearer token
    const sessionToken = request.cookies.get('poltr_session')?.value;
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    const fetchInit = {
        method: request.method,
        headers
    };
    // Forward body for non-GET requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        fetchInit.body = await request.text();
    }
    let res;
    try {
        res = await fetch(url.toString(), fetchInit);
    } catch (err) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'service_unavailable',
            message: 'AppView is not reachable'
        }, {
            status: 502
        });
    }
    const responseBody = await res.text();
    const response = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"](responseBody, {
        status: res.status,
        headers: {
            'Content-Type': res.headers.get('Content-Type') || 'application/json'
        }
    });
    // If the appview says the session is invalid/expired, clear the cookie
    // so the frontend stops sending a stale token.
    if (res.status === 401 && sessionToken) {
        response.cookies.set('poltr_session', '', {
            httpOnly: true,
            secure: ("TURBOPACK compile-time value", "development") === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 0
        });
    }
    return response;
}
const GET = proxyRequest;
const POST = proxyRequest;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__074362c6._.js.map