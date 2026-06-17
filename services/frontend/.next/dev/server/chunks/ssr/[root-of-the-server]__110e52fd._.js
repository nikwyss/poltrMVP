module.exports = [
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/src/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/src/app/[slug]/not-found.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/[slug]/not-found.tsx [app-rsc] (ecmascript)"));
}),
"[project]/src/lib/cms.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getBlock",
    ()=>getBlock,
    "getBlocksByPlacement",
    ()=>getBlocksByPlacement,
    "getMedia",
    ()=>getMedia,
    "getPage",
    ()=>getPage,
    "getPages",
    ()=>getPages,
    "getSettings",
    ()=>getSettings
]);
/**
 * CMS API Client
 * Fetches content from Payload CMS at cms.poltr.info
 */ // Server-only: CMS URL is not exposed to the client
const CMS_INTERNAL_SERVER_URL = process.env.CMS_INTERNAL_SERVER_URL;
async function fetchCMS(endpoint, locale = "de", options) {
    const url = new URL(`/api${endpoint}`, CMS_INTERNAL_SERVER_URL);
    url.searchParams.set("locale", locale);
    url.searchParams.set("fallback-locale", "de");
    const response = await fetch(url.toString(), {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options?.headers
        },
        next: {
            revalidate: 60
        }
    });
    if (!response.ok) {
        throw new Error(`CMS API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}
async function getPage(slug, locale = "de") {
    try {
        const response = await fetchCMS(`/pages?where[slug][equals]=${encodeURIComponent(slug)}&where[status][equals]=published`, locale);
        return response.docs[0] ?? null;
    } catch (error) {
        console.error("Error fetching page:", error);
        return null;
    }
}
async function getPages(locale = "de") {
    try {
        const response = await fetchCMS("/pages?where[status][equals]=published&sort=title&limit=100", locale);
        return response.docs;
    } catch (error) {
        console.error("Error fetching pages:", error);
        return [];
    }
}
async function getBlock(slug, locale = "de") {
    try {
        const response = await fetchCMS(`/blocks?where[slug][equals]=${encodeURIComponent(slug)}&where[active][equals]=true`, locale);
        return response.docs[0] ?? null;
    } catch (error) {
        console.error("Error fetching block:", error);
        return null;
    }
}
async function getBlocksByPlacement(placement, locale = "de") {
    try {
        const response = await fetchCMS(`/blocks?where[placement][equals]=${encodeURIComponent(placement)}&where[active][equals]=true&sort=-priority&limit=100`, locale);
        return response.docs;
    } catch (error) {
        console.error("Error fetching blocks:", error);
        return [];
    }
}
async function getSettings(locale = "de") {
    try {
        return await fetchCMS("/globals/settings", locale);
    } catch (error) {
        console.error("Error fetching settings:", error);
        return null;
    }
}
async function getMedia(id, locale = "de") {
    try {
        return await fetchCMS(`/media/${id}`, locale);
    } catch (error) {
        console.error("Error fetching media:", error);
        return null;
    }
}
}),
"[project]/src/components/RichText.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "RichText",
    ()=>RichText
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
/**
 * Lightweight Lexical Rich Text Renderer
 * Renders Payload CMS Lexical JSON without needing @payloadcms packages
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react.js [app-rsc] (ecmascript)");
;
;
// Format flags (bitmask)
const IS_BOLD = 1;
const IS_ITALIC = 2;
const IS_STRIKETHROUGH = 4;
const IS_UNDERLINE = 8;
const IS_CODE = 16;
function renderText(node) {
    let text = node.text || '';
    const format = node.format || 0;
    if (format & IS_CODE) text = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
        children: text
    }, void 0, false, {
        fileName: "[project]/src/components/RichText.tsx",
        lineNumber: 39,
        columnNumber: 32
    }, this);
    if (format & IS_BOLD) text = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
        children: text
    }, void 0, false, {
        fileName: "[project]/src/components/RichText.tsx",
        lineNumber: 40,
        columnNumber: 32
    }, this);
    if (format & IS_ITALIC) text = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("em", {
        children: text
    }, void 0, false, {
        fileName: "[project]/src/components/RichText.tsx",
        lineNumber: 41,
        columnNumber: 34
    }, this);
    if (format & IS_UNDERLINE) text = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("u", {
        children: text
    }, void 0, false, {
        fileName: "[project]/src/components/RichText.tsx",
        lineNumber: 42,
        columnNumber: 37
    }, this);
    if (format & IS_STRIKETHROUGH) text = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("s", {
        children: text
    }, void 0, false, {
        fileName: "[project]/src/components/RichText.tsx",
        lineNumber: 43,
        columnNumber: 41
    }, this);
    return text;
}
function renderNode(node, index) {
    const key = `${node.type}-${index}`;
    const children = node.children?.map((child, i)=>renderNode(child, i));
    switch(node.type){
        case 'text':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].Fragment, {
                children: renderText(node)
            }, key, false, {
                fileName: "[project]/src/components/RichText.tsx",
                lineNumber: 54,
                columnNumber: 14
            }, this);
        case 'paragraph':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                children: children
            }, key, false, {
                fileName: "[project]/src/components/RichText.tsx",
                lineNumber: 57,
                columnNumber: 14
            }, this);
        case 'heading':
            const headingTag = node.tag;
            const HeadingTag = [
                'h1',
                'h2',
                'h3',
                'h4',
                'h5',
                'h6'
            ].includes(headingTag) ? headingTag : 'h2';
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(HeadingTag, {
                children: children
            }, key, false, {
                fileName: "[project]/src/components/RichText.tsx",
                lineNumber: 62,
                columnNumber: 14
            }, this);
        case 'list':
            const ListTag = node.listType === 'number' ? 'ol' : 'ul';
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(ListTag, {
                children: children
            }, key, false, {
                fileName: "[project]/src/components/RichText.tsx",
                lineNumber: 66,
                columnNumber: 14
            }, this);
        case 'listitem':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                children: children
            }, key, false, {
                fileName: "[project]/src/components/RichText.tsx",
                lineNumber: 69,
                columnNumber: 14
            }, this);
        case 'link':
            const rawHref = typeof node.url === 'string' ? node.url : '';
            const href = /^(https?:\/\/|mailto:|tel:|\/)/.test(rawHref) ? rawHref : '#';
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                href: href,
                target: node.newTab ? '_blank' : undefined,
                rel: node.newTab ? 'noopener noreferrer' : undefined,
                children: children
            }, key, false, {
                fileName: "[project]/src/components/RichText.tsx",
                lineNumber: 75,
                columnNumber: 9
            }, this);
        case 'quote':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("blockquote", {
                children: children
            }, key, false, {
                fileName: "[project]/src/components/RichText.tsx",
                lineNumber: 86,
                columnNumber: 14
            }, this);
        case 'upload':
            const media = node.value;
            if (media?.url) {
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("figure", {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                        src: media.url,
                        alt: media.alt || ''
                    }, void 0, false, {
                        fileName: "[project]/src/components/RichText.tsx",
                        lineNumber: 93,
                        columnNumber: 13
                    }, this)
                }, key, false, {
                    fileName: "[project]/src/components/RichText.tsx",
                    lineNumber: 92,
                    columnNumber: 11
                }, this);
            }
            return null;
        case 'horizontalrule':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("hr", {}, key, false, {
                fileName: "[project]/src/components/RichText.tsx",
                lineNumber: 100,
                columnNumber: 14
            }, this);
        case 'linebreak':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, key, false, {
                fileName: "[project]/src/components/RichText.tsx",
                lineNumber: 103,
                columnNumber: 14
            }, this);
        default:
            // For unknown types, just render children
            return children ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: children
            }, key, false, {
                fileName: "[project]/src/components/RichText.tsx",
                lineNumber: 107,
                columnNumber: 25
            }, this) : null;
    }
}
function RichText({ content, className }) {
    if (!content || typeof content !== 'object') {
        return null;
    }
    const lexical = content;
    if (!lexical.root?.children) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: className,
        children: lexical.root.children.map((node, index)=>renderNode(node, index))
    }, void 0, false, {
        fileName: "[project]/src/components/RichText.tsx",
        lineNumber: 127,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/[slug]/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>CMSPage,
    "generateMetadata",
    ()=>generateMetadata,
    "generateStaticParams",
    ()=>generateStaticParams
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$cms$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/cms.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$RichText$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/RichText.tsx [app-rsc] (ecmascript)");
;
;
;
;
async function generateStaticParams() {
    const pages = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$cms$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getPages"])();
    return pages.map((page)=>({
            slug: page.slug
        }));
}
async function generateMetadata({ params }) {
    const { slug } = await params;
    const page = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$cms$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getPage"])(slug);
    if (!page) {
        return {
            title: 'Page Not Found'
        };
    }
    return {
        title: page.meta?.title || page.title,
        description: page.meta?.description || page.excerpt,
        openGraph: page.meta?.image?.url ? {
            images: [
                {
                    url: page.meta.image.url
                }
            ]
        } : undefined
    };
}
async function CMSPage({ params }) {
    const { slug } = await params;
    const page = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$cms$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getPage"])(slug);
    if (!page) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["notFound"])();
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
        className: "cms-page",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        children: page.title
                    }, void 0, false, {
                        fileName: "[project]/src/app/[slug]/page.tsx",
                        lineNumber: 45,
                        columnNumber: 9
                    }, this),
                    page.excerpt && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "excerpt",
                        children: page.excerpt
                    }, void 0, false, {
                        fileName: "[project]/src/app/[slug]/page.tsx",
                        lineNumber: 46,
                        columnNumber: 26
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/[slug]/page.tsx",
                lineNumber: 44,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$RichText$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["RichText"], {
                content: page.content,
                className: "content"
            }, void 0, false, {
                fileName: "[project]/src/app/[slug]/page.tsx",
                lineNumber: 49,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/[slug]/page.tsx",
        lineNumber: 43,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/[slug]/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/[slug]/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__110e52fd._.js.map