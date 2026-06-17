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
"[project]/src/app/api/auth/wait-status/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$appview$2d$proxy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/appview-proxy.ts [app-route] (ecmascript)");
;
;
const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
async function POST(request) {
    const initiatorSecret = request.cookies.get('poltr_auth_init')?.value;
    const sessionToken = request.cookies.get('poltr_session')?.value;
    const headers = {
        'Content-Type': 'application/json',
        ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$appview$2d$proxy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["appviewForwardHeaders"])(request)
    };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    const res = await fetch(`${APPVIEW_URL}/xrpc/ch.poltr.auth.waitStatus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            initiatorSecret
        })
    });
    const data = await res.json().catch(()=>({}));
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(data, {
        status: res.status
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__d6305882._.js.map