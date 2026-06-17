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
"[project]/src/app/api/poltr/[...path]/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
;
/**
 * REST proxy to the AppView basis-app layer (CMS-backed, NOT ATProto).
 *
 * Pattern mirrors `app/api/xrpc/[...path]` but forwards to `/api/<path>` on
 * the AppView instead of `/xrpc/<path>`. The URL split makes the
 * architecture visible: `/api/xrpc/*` = deliberation layer (ATProto),
 * `/api/poltr/*` = basis-app (e.g. ballots).
 */ const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
async function proxyRequest(request, { params }) {
    const { path } = await params;
    const restPath = path.join('/');
    const url = new URL(`${APPVIEW_URL}/api/${restPath}`);
    // Forward query parameters (including `?lang=<code>`).
    request.nextUrl.searchParams.forEach((value, key)=>{
        url.searchParams.set(key, value);
    });
    // Reflect the in-app language switch: inject ?lang from the `locale` cookie
    // (set by the locale switcher) unless the caller already passed one — so
    // ballots localize to the chosen UI language, not just the browser's.
    if (!url.searchParams.has('lang')) {
        const locale = request.cookies.get('locale')?.value;
        if (locale) url.searchParams.set('lang', locale);
    }
    const headers = {};
    const contentType = request.headers.get('content-type');
    if (contentType) {
        headers['Content-Type'] = contentType;
    }
    // Read session cookie and forward as Bearer token (same scheme as xrpc proxy).
    const sessionToken = request.cookies.get('poltr_session')?.value;
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    // Forward Accept-Language so the AppView can fall back on the header when
    // no `?lang=` was provided.
    const acceptLanguage = request.headers.get('accept-language');
    if (acceptLanguage) {
        headers['Accept-Language'] = acceptLanguage;
    }
    const fetchInit = {
        method: request.method,
        headers
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        fetchInit.body = await request.text();
    }
    let res;
    try {
        res = await fetch(url.toString(), fetchInit);
    } catch (_err) {
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

//# sourceMappingURL=%5Broot-of-the-server%5D__312626fb._.js.map