module.exports = [
"[project]/src/lib/queries/rating-gate.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "computeRatingGate",
    ()=>computeRatingGate,
    "useRatingGate",
    ()=>useRatingGate
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/queries/taxonomy.ts [app-ssr] (ecmascript)");
"use client";
;
function computeRatingGate(topics, perTopicTarget = 2) {
    const perTopic = topics.map((node)=>{
        const target = Math.min(perTopicTarget, node.argumentCount);
        const rated = node.ratedCount ?? 0;
        return {
            id: node.id,
            name: node.name,
            rated,
            target,
            met: rated >= target
        };
    });
    const topicsMet = perTopic.filter((tp)=>tp.met).length;
    return {
        // Leere Themenliste ⇒ nichts zu sperren ⇒ freigeschaltet.
        unlocked: perTopic.every((tp)=>tp.met),
        topicsMet,
        topicsTotal: perTopic.length,
        perTopic
    };
}
function useRatingGate(ballotId, locale, enabled = true) {
    const { data } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTaxonomyBase"])(ballotId, locale, enabled);
    return computeRatingGate(data?.tree.children ?? []);
}
}),
"[project]/src/components/view-toggle.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ARGUMENTS_VIEWS",
    ()=>ARGUMENTS_VIEWS,
    "ARGUMENTS_VIEW_STORAGE_KEY",
    ()=>ARGUMENTS_VIEW_STORAGE_KEY,
    "DEFAULT_ARGUMENTS_VIEW",
    ()=>DEFAULT_ARGUMENTS_VIEW,
    "ViewToggle",
    ()=>ViewToggle,
    "readStoredArgumentsView",
    ()=>readStoredArgumentsView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$list$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__List$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/list.js [app-ssr] (ecmascript) <export default as List>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/book-open.js [app-ssr] (ecmascript) <export default as BookOpen>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$network$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Network$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/network.js [app-ssr] (ecmascript) <export default as Network>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
const ARGUMENTS_VIEWS = [
    "feed",
    "booklet",
    "taxonomy"
];
const DEFAULT_ARGUMENTS_VIEW = "taxonomy";
const ARGUMENTS_VIEW_STORAGE_KEY = "poltr.argumentsView";
function readStoredArgumentsView() {
    if ("TURBOPACK compile-time truthy", 1) return DEFAULT_ARGUMENTS_VIEW;
    //TURBOPACK unreachable
    ;
    const raw = undefined;
}
function persistArgumentsView(view) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
const viewDefs = [
    {
        key: "taxonomy",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$network$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Network$3e$__["Network"],
        labelKey: "taxonomy",
        segment: "taxonomy"
    },
    {
        key: "booklet",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__["BookOpen"],
        labelKey: "booklet",
        segment: "booklet"
    },
    {
        key: "feed",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$list$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__List$3e$__["List"],
        labelKey: "feed",
        segment: "feed"
    }
];
function ViewToggle({ active, ballotId }) {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])("viewToggle");
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        persistArgumentsView(active);
    }, [
        active
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center gap-1.5 shrink-0",
        children: viewDefs.map(({ key, icon: Icon, labelKey, segment })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                title: t(labelKey),
                onClick: ()=>{
                    if (key === active) return;
                    persistArgumentsView(key);
                    router.push(`/ballot/${ballotId}/arguments/${segment}`);
                },
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex items-center justify-center size-[30px] rounded-[var(--r-sm)] border transition-all duration-150 cursor-pointer", key === active ? "border-[var(--line-mid)] bg-accent text-[var(--text)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-mid)] hover:bg-accent hover:border-[var(--line-mid)]"),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                    className: "h-3.5 w-3.5"
                }, void 0, false, {
                    fileName: "[project]/src/components/view-toggle.tsx",
                    lineNumber: 77,
                    columnNumber: 11
                }, this)
            }, key, false, {
                fileName: "[project]/src/components/view-toggle.tsx",
                lineNumber: 61,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/src/components/view-toggle.tsx",
        lineNumber: 59,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/position-band.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PositionBand",
    ()=>PositionBand,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-ssr] (ecmascript)");
"use client";
;
;
const SPLIT_THRESHOLD = 0.5;
// Weiche Palette passend zum warmen App-Hintergrund.
const BLUE = {
    r: 74,
    g: 119,
    b: 190
}; // Richtung Befürworter
const TERRA = {
    r: 178,
    g: 116,
    b: 92
}; // Richtung Gegner
// Volltöne für Zahl-Labels (klar lesbar auf cremefarbenem Grund).
const BLUE_TEXT = "rgb(46, 92, 168)";
const TERRA_TEXT = "rgb(166, 86, 56)";
// Maximaler Balken-/Spur-Ausschlag in % je Seite (von der Mitte aus). < 50,
// damit am äusseren Ende Platz für das Zahl-Label bleibt. Feste, symmetrische
// Skala: HALF entspricht ±100 — so bildet die Spur die volle Skala ab.
const HALF = 42;
// Betrag → Deckkraft (kleine Neigung = blass, starke = satt).
function intensity(mag) {
    return 0.32 + 0.6 * Math.min(1, mag / 0.6);
}
function barColor(lean) {
    const c = lean >= 0 ? BLUE : TERRA;
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${intensity(Math.abs(lean))})`;
}
// −/+ mit echtem Minuszeichen, z. B. „+46", „−28".
function signed(lean) {
    const v = Math.round(lean * 100);
    if (v > 0) return `+${v}`;
    if (v < 0) return `−${Math.abs(v)}`;
    return "0";
}
function PositionBand({ nodes, t }) {
    if (!nodes.length) return null;
    const rowGrid = "grid grid-cols-[minmax(140px,230px)_1fr] items-center gap-3";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
        className: "border-black/5 py-5",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "px-4",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-0.5 text-sm font-medium text-foreground/90",
                    children: t("bandTitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/position-band.tsx",
                    lineNumber: 61,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-4 text-[13px] leading-snug text-muted-foreground",
                    children: t("bandSubtitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/position-band.tsx",
                    lineNumber: 64,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: rowGrid,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                            fileName: "[project]/src/components/position-band.tsx",
                            lineNumber: 70,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex justify-between text-xs font-medium text-muted-foreground",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: t("poleOpponents")
                                }, void 0, false, {
                                    fileName: "[project]/src/components/position-band.tsx",
                                    lineNumber: 72,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: t("poleSupporters")
                                }, void 0, false, {
                                    fileName: "[project]/src/components/position-band.tsx",
                                    lineNumber: 73,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/position-band.tsx",
                            lineNumber: 71,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/position-band.tsx",
                    lineNumber: 69,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "relative mt-2 flex flex-col gap-1.5",
                    children: nodes.map((n)=>{
                        const lean = n.proLeaning;
                        const split = (n.dissent ?? 0) > SPLIT_THRESHOLD;
                        const frac = lean == null ? 0 : Math.abs(lean) * HALF;
                        const pos = lean != null && lean >= 0;
                        // Tooltip am Balken/Wert: Seite + Wert (+ Hinweis, wenn gespalten).
                        const tip = lean == null ? t("unrated") : `${pos ? t("poleSupporters") : t("poleOpponents")} · ${signed(lean)}` + (split ? ` · ${t("split")}` : "");
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: rowGrid,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "truncate text-left text-sm text-foreground/80",
                                    title: n.name,
                                    children: n.name
                                }, void 0, false, {
                                    fileName: "[project]/src/components/position-band.tsx",
                                    lineNumber: 93,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "relative h-7",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "absolute top-1/2 right-1/2 h-4 -translate-y-1/2 rounded-l-md bg-black/[0.05]",
                                            style: {
                                                width: `${HALF}%`
                                            }
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/position-band.tsx",
                                            lineNumber: 104,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "absolute top-1/2 left-1/2 h-4 -translate-y-1/2 rounded-r-md bg-black/[0.05]",
                                            style: {
                                                width: `${HALF}%`
                                            }
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/position-band.tsx",
                                            lineNumber: 108,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-black/20"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/position-band.tsx",
                                            lineNumber: 114,
                                            columnNumber: 19
                                        }, this),
                                        lean == null ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--line-mid)]",
                                            title: t("unrated")
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/position-band.tsx",
                                            lineNumber: 117,
                                            columnNumber: 21
                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `absolute top-1/2 h-4 -translate-y-1/2 ${pos ? "left-1/2 rounded-r-md" : "right-1/2 rounded-l-md"}`,
                                                    style: {
                                                        width: `${frac}%`,
                                                        background: barColor(lean)
                                                    },
                                                    title: tip
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/position-band.tsx",
                                                    lineNumber: 124,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "absolute top-1/2 -translate-y-1/2 text-xs font-semibold tabular-nums",
                                                    style: {
                                                        color: pos ? BLUE_TEXT : TERRA_TEXT,
                                                        ...pos ? {
                                                            left: `calc(50% + ${frac}% + 6px)`
                                                        } : {
                                                            right: `calc(50% + ${frac}% + 6px)`
                                                        }
                                                    },
                                                    title: tip,
                                                    children: signed(lean)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/position-band.tsx",
                                                    lineNumber: 137,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, void 0, true)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/position-band.tsx",
                                    lineNumber: 100,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, n.id, true, {
                            fileName: "[project]/src/components/position-band.tsx",
                            lineNumber: 92,
                            columnNumber: 15
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/src/components/position-band.tsx",
                    lineNumber: 78,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/position-band.tsx",
            lineNumber: 60,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/position-band.tsx",
        lineNumber: 59,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = PositionBand;
}),
"[project]/src/components/position-cloud.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PositionCloud",
    ()=>PositionCloud,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
/**
 * Positionswolken — divergierende Likert-Verteilung je Thema. Schwesteransicht
 * zum Positionsband: Statt eines einzelnen Balkens fällt jede Argument-Bewertung
 * in eine von fünf Stufen (Nein · eher Nein · neutral · eher Ja · Ja). Die Stufen
 * werden als Pill-Segmente auf einer dezenten Schiene gestapelt und von der
 * neutralen Mitte aus ausgewogen — die neutrale Stufe sitzt mittig auf der Achse,
 * Ablehnung wächst nach links, Zustimmung nach rechts.
 *
 * Die Zeilen sind nach Netto-Zustimmung sortiert (Leaderboard). Das Badge rechts
 * verdichtet alles auf eine Kennzahl: Netto-Score = Zustimmung − Ablehnung in
 * Prozentpunkten (neutral zählt nicht).
 *
 * Skala für ALLE Themen identisch (sonst nicht vergleichbar): gleiche
 * Stufengrenzen, gleiche Mitte, gemeinsame Schiene.
 *
 * Achs-Mapping: c = (PRO ? +1 : −1) · (preference − 50) / 50 ∈ [−1, 1]
 * (−1 = Nein, 0 = neutral, +1 = Ja) — identisch zu Positionsband/Panorama.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
// Fünf Likert-Stufen, von Ablehnung (links) zu Zustimmung (rechts).
const CATS = [
    {
        key: "no",
        label: "panoramaNo",
        color: "#8a4a37"
    },
    {
        key: "ratherNo",
        label: "cloudRatherNo",
        color: "#cd8a6a"
    },
    {
        key: "neutral",
        label: "neutral",
        color: "#bcbcbc"
    },
    {
        key: "ratherYes",
        label: "cloudRatherYes",
        color: "#9cc8ae"
    },
    {
        key: "yes",
        label: "panoramaYes",
        color: "#4e9b76"
    }
];
// Volltöne fürs Netto-Score-Badge.
const POS = {
    bg: "rgba(78, 155, 118, 0.14)",
    fg: "rgb(47, 122, 89)"
};
const NEG = {
    bg: "rgba(178, 116, 92, 0.16)",
    fg: "rgb(166, 86, 56)"
};
const ZERO = {
    bg: "rgba(0,0,0,0.05)",
    fg: "var(--muted-foreground)"
};
/* ---------- Achsen-Geometrie (viewBox-Breite 600) ---------- */ const VW = 600;
const PAD = 10;
const X0 = PAD;
const X1 = VW - PAD;
const XC = (X0 + X1) / 2; // neutrale Mitte
const HALF = (X1 - X0) / 2; // entspricht Anteil 1.0 je Seite
const BARH = 22;
const BAR_Y = 4;
const BAR_H = 14;
const TRACK_Y = 3;
const TRACK_H = 16;
const GAP = 2; // Lücke zwischen Pill-Segmenten (px)
// c ∈ [−1,1] → Likert-Stufe 0…4 (gleich breite Fünftel).
function categorize(c) {
    if (c < -0.6) return 0;
    if (c < -0.2) return 1;
    if (c <= 0.2) return 2;
    if (c <= 0.6) return 3;
    return 4;
}
// −/+ mit echtem Minuszeichen, z. B. „+46", „−28". v ∈ [−1,1] → Prozentpunkte.
function signed(v) {
    const n = Math.round(v * 100);
    if (n > 0) return `+${n}`;
    if (n < 0) return `−${Math.abs(n)}`;
    return "0";
}
/* ---------- distinct Bewertungen eines Teilbaums ---------- */ function collectContribs(node) {
    const seen = new Map();
    const walk = (n)=>{
        for (const a of n.arguments ?? []){
            if (a.viewerPreference == null || seen.has(a.uri)) continue;
            const sign = a.type === "PRO" ? 1 : -1;
            seen.set(a.uri, sign * (a.viewerPreference - 50) / 50);
        }
        for (const c of n.children ?? [])walk(c);
    };
    walk(node);
    return [
        ...seen.values()
    ];
}
function PositionCloud({ nodes, t }) {
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const built = nodes.map((node)=>{
            const cs = collectContribs(node);
            const n = cs.length;
            const counts = [
                0,
                0,
                0,
                0,
                0
            ];
            for (const c of cs)counts[categorize(c)]++;
            const f = counts.map((k)=>n ? k / n : 0);
            // Kennzahl: Mittelwert aller Bewertungen (c ∈ [−1,1] → Prozentpunkte).
            const mean = n ? cs.reduce((a, b)=>a + b, 0) / n : 0;
            // Divergierend: neutrale Stufe mittig auf der Achse, Rest links/rechts.
            const segs = [];
            let acc = -(f[0] + f[1] + f[2] / 2); // Anteil am linken Bar-Rand
            for(let i = 0; i < 5; i++){
                if (f[i] > 0) segs.push({
                    i,
                    x: XC + acc * HALF + GAP / 2,
                    w: Math.max(1, f[i] * HALF - GAP)
                });
                acc += f[i];
            }
            return {
                node,
                n,
                mean,
                segs
            };
        });
        // Leaderboard: nach mittlerer Position; unbewertete ans Ende.
        return built.sort((a, b)=>{
            if (a.n === 0 || b.n === 0) return a.n === 0 ? b.n === 0 ? 0 : 1 : -1;
            return b.mean - a.mean;
        });
    }, [
        nodes
    ]);
    if (!nodes.length) return null;
    const rowGrid = "grid grid-cols-[minmax(120px,200px)_1fr_auto] items-center gap-3";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
        className: "border-black/5 py-5",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "px-4",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-0.5 text-sm font-medium text-foreground/90",
                    children: t("cloudTitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/position-cloud.tsx",
                    lineNumber: 129,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-3 text-[13px] leading-snug text-muted-foreground",
                    children: t("cloudSubtitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/position-cloud.tsx",
                    lineNumber: 132,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground",
                    children: CATS.map((cat)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "inline-flex items-center gap-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "h-2.5 w-2.5 rounded-[3px]",
                                    style: {
                                        background: cat.color
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/src/components/position-cloud.tsx",
                                    lineNumber: 140,
                                    columnNumber: 15
                                }, this),
                                t(cat.label)
                            ]
                        }, cat.key, true, {
                            fileName: "[project]/src/components/position-cloud.tsx",
                            lineNumber: 139,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/src/components/position-cloud.tsx",
                    lineNumber: 137,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-col gap-1.5",
                    children: rows.map(({ node, n, mean, segs })=>{
                        const badge = n === 0 ? ZERO : mean > 0 ? POS : mean < 0 ? NEG : ZERO;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: rowGrid,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "truncate text-left text-sm text-foreground/80",
                                    title: node.name,
                                    children: node.name
                                }, void 0, false, {
                                    fileName: "[project]/src/components/position-cloud.tsx",
                                    lineNumber: 154,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    viewBox: `0 0 ${VW} ${BARH}`,
                                    className: "block h-auto w-full",
                                    role: "img",
                                    "aria-label": `${node.name} · n=${n} · ${signed(mean)}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                            x: X0,
                                            y: TRACK_Y,
                                            width: X1 - X0,
                                            height: TRACK_H,
                                            rx: TRACK_H / 2,
                                            fill: "rgba(0,0,0,0.04)"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/position-cloud.tsx",
                                            lineNumber: 168,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: XC,
                                            y1: 1,
                                            x2: XC,
                                            y2: BARH - 1,
                                            stroke: "var(--line-mid)",
                                            strokeWidth: 0.6,
                                            strokeDasharray: "3 3"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/position-cloud.tsx",
                                            lineNumber: 177,
                                            columnNumber: 19
                                        }, this),
                                        n > 0 ? segs.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                                x: s.x,
                                                y: BAR_Y,
                                                width: s.w,
                                                height: BAR_H,
                                                rx: BAR_H / 2,
                                                fill: CATS[s.i].color,
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("title", {
                                                    children: `${t(CATS[s.i].label)}`
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/position-cloud.tsx",
                                                    lineNumber: 198,
                                                    columnNumber: 25
                                                }, this)
                                            }, s.i, false, {
                                                fileName: "[project]/src/components/position-cloud.tsx",
                                                lineNumber: 189,
                                                columnNumber: 23
                                            }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                            cx: XC,
                                            cy: BARH / 2,
                                            r: 3,
                                            fill: "var(--line-mid)"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/position-cloud.tsx",
                                            lineNumber: 202,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/position-cloud.tsx",
                                    lineNumber: 161,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "justify-self-end rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                                    style: {
                                        background: badge.bg,
                                        color: badge.fg
                                    },
                                    title: n === 0 ? t("unrated") : undefined,
                                    children: n === 0 ? "—" : signed(mean)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/position-cloud.tsx",
                                    lineNumber: 211,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, node.id, true, {
                            fileName: "[project]/src/components/position-cloud.tsx",
                            lineNumber: 153,
                            columnNumber: 15
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/src/components/position-cloud.tsx",
                    lineNumber: 149,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `${rowGrid} mt-2`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                            fileName: "[project]/src/components/position-cloud.tsx",
                            lineNumber: 225,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex justify-between text-xs font-medium text-muted-foreground",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: [
                                        "← ",
                                        t("cloudMoreNo")
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/position-cloud.tsx",
                                    lineNumber: 227,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: t("neutral")
                                }, void 0, false, {
                                    fileName: "[project]/src/components/position-cloud.tsx",
                                    lineNumber: 228,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: [
                                        t("cloudMoreYes"),
                                        " →"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/position-cloud.tsx",
                                    lineNumber: 229,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/position-cloud.tsx",
                            lineNumber: 226,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                            fileName: "[project]/src/components/position-cloud.tsx",
                            lineNumber: 231,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/position-cloud.tsx",
                    lineNumber: 224,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/position-cloud.tsx",
            lineNumber: 128,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/position-cloud.tsx",
        lineNumber: 127,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = PositionCloud;
}),
"[project]/src/components/topic-panorama.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TopicPanorama",
    ()=>TopicPanorama,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
/**
 * Themen-Panorama — überlagerte farbige Bergketten, eine pro Thema.
 *
 * MODELL: Jedes bewertete Argument ist ein kleiner Berg an seiner Bewertungs-
 * position c ∈ [-1, 1] (aus `type` PRO/CONTRA und `viewerPreference` 0–100) mit
 * Default-Breite W und Default-Höhe H. Innerhalb eines Themas ADDIEREN sich die
 * überlappenden Mini-Berge zu einem Grat — die Höhe entsteht also aus der
 * Häufung, nicht aus einem gesetzten Wichtigkeitswert. Streuung ⇒ breite flache
 * Kette, Häufung ⇒ hoher Gipfel, Polarisierung ⇒ Doppelkette mit Tal (ganz ohne
 * Sonderfall).
 *
 * Farbe trägt das Thema (Legende), darum keine Labels/Leitlinien im Massiv mehr.
 * Die kurzen Striche auf der Achse sind die einzelnen Argumente — so sieht man,
 * woraus sich jede Kette zusammensetzt. Legenden-Hover hebt eine Kette hervor;
 * ein farbiger Punkt je Kette markiert optional den Mittelwert.
 *
 * Achs-Mapping: c = -1 → Nein, c = 0 → neutral, c = +1 → Ja.
 * Schwesteransicht zum Positionsband — dieselben Daten, andere Lesart.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
const BACK_RGB = [
    198,
    210,
    226
]; // hinten (fern, dunstig)
const FRONT_RGB = [
    50,
    63,
    92
]; // vorne (nah, dunkel)
const HAZE_RGB = [
    226,
    232,
    241
]; // Dunst am Bergfuss
const lerp = (a, b, t)=>a + (b - a) * t;
const mix = (c1, c2, t)=>[
        Math.round(lerp(c1[0], c2[0], t)),
        Math.round(lerp(c1[1], c2[1], t)),
        Math.round(lerp(c1[2], c2[2], t))
    ];
const rgbOf = ([r, g, b], a = 1)=>a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
// depth ∈ [0..n-1]: 0 = hinten (hell), n-1 = vorne (dunkel).
const depthColor = (depth, n)=>mix(BACK_RGB, FRONT_RGB, n <= 1 ? 1 : depth / (n - 1));
/* ---------- Geometrie / Skala (viewBox 0 0 680 300) ---------- */ const BASE_Y = 270;
const TOP_PAD = 78; // oberes Band für Labels + Leitlinien reserviert
const AVAIL = BASE_Y - TOP_PAD; // verfügbare Höhe für den höchsten Grat
const PX_MIN = 8;
const PX_MAX = 672;
// c ∈ [-1.1,1.1] → px (-1 → 60, 0 → 340, +1 → 620), geklemmt.
const xPx = (c)=>Math.max(PX_MIN, Math.min(PX_MAX, 340 + c * 280));
// Defaults für W (Breite je Argument, in c-Einheiten) und H (Höhe je Argument,
// in px für einen isolierten Mini-Berg).
const DEFAULT_W = 0.16;
const DEFAULT_H = 22;
const DEFAULT_JITTER = 0.5; // Berglinien-Stärke (Anteil der lokalen Grathöhe)
const GRID = 160; // Stützpunkte je Kette (höher ⇒ schärfere Spitzen/Zacken)
// −/+ mit echtem Minuszeichen, z. B. „+46", „−28".
function signed(v) {
    const n = Math.round(v * 100);
    if (n > 0) return `+${n}`;
    if (n < 0) return `−${Math.abs(n)}`;
    return "0";
}
/* ---------- deterministischer Zufall (Seed pro Thema) ---------- */ function hash(str) {
    let h = 2166136261;
    for(let i = 0; i < str.length; i++){
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function mulberry32(a) {
    return function() {
        a |= 0;
        a = a + 0x6d2b79f5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
// fBm Value-Noise (mehrere Oktaven) über u ∈ [0,1], Werte ~[-1,1]. Deterministisch
// (Seed pro Thema), smoothstep-interpoliert → craggy „Berglinie", aber stetig.
function noiseFn(seed) {
    const OCTAVES = 4;
    const BASE_FREQ = 6;
    const rand = mulberry32(seed);
    const layers = [];
    let totalAmp = 0;
    for(let o = 0; o < OCTAVES; o++){
        const freq = BASE_FREQ * 2 ** o; // 6, 12, 24, 48
        const lattice = new Array(freq + 2);
        for(let i = 0; i < lattice.length; i++)lattice[i] = rand() * 2 - 1;
        // langsamer Abfall ⇒ mittlere/feine Frequenzen tragen mehr ⇒ kantiger.
        const amp = 0.72 ** o;
        layers.push({
            freq,
            lattice,
            amp
        });
        totalAmp += amp;
    }
    // LINEARE Interpolation (kein smoothstep) ⇒ scharfe Knicke an den Gitterpunkten
    // statt weicher Wellen ⇒ kantige Berglinie.
    return (u)=>{
        const uu = Math.max(0, Math.min(1, u));
        let s = 0;
        for (const { freq, lattice, amp } of layers){
            const x = uu * freq;
            const i = Math.floor(x);
            const f = x - i;
            s += amp * (lattice[i] + f * (lattice[i + 1] - lattice[i]));
        }
        return s / totalAmp;
    };
}
/* ---------- Argument-Positionen eines Teilbaums (distinct) ---------- */ // c = (PRO ? +1 : -1) * (preference - 50) / 50 ∈ [-1,1]; neutral (50) = 0,
// zählt mit. Spiegelt die Backend-Aggregation (taxonomy.py).
function collectContribs(node) {
    const seen = new Map();
    const walk = (n)=>{
        for (const a of n.arguments ?? []){
            if (a.viewerPreference == null || seen.has(a.uri)) continue;
            const sign = a.type === "PRO" ? 1 : -1;
            seen.set(a.uri, sign * (a.viewerPreference - 50) / 50);
        }
        for (const c of n.children ?? [])walk(c);
    };
    walk(node);
    return [
        ...seen.values()
    ];
}
// Spitzer Mini-Berg-Kern: Peak 1 bei dist 0, linear auf 0 bei dist = W (Dreieck/
// Zelt). Spitzer als ein Kosinus-Bump ⇒ kantigere, weniger runde Gipfel.
const bump = (dist, w)=>dist >= w ? 0 : 1 - dist / w;
function buildChains(nodes, W, H, jitter, normalize, stacked) {
    const prepared = nodes.map((node, idx)=>({
            node,
            idx,
            contribs: collectContribs(node)
        })).filter((p)=>p.contribs.length > 0);
    if (!prepared.length) return [];
    if (stacked) return buildStacked(prepared, W, H, jitter, normalize);
    // 1. Pass: je Thema die summierte Dichte über das eigene Trägerintervall
    //    sampeln. NORMALISIERT: durch die Argumentzahl teilen ⇒ jede Kette hat
    //    dieselbe Fläche (∫ = Fläche eines Einzel-Bumps), unabhängig davon, ob ein
    //    Thema mit 2 oder 50 Argumenten bewertet wurde. Häufung zeigt sich dann als
    //    Form (hoch/schmal vs. flach/breit), nicht als Gesamtfläche.
    const sampled = prepared.map(({ node, idx, contribs })=>{
        const norm = normalize ? 1 / contribs.length : 1;
        const lo = Math.max(-1.1, Math.min(...contribs) - W);
        const hi = Math.min(1.1, Math.max(...contribs) + W);
        const span = hi - lo || 0.001;
        const units = [];
        let localMax = 0;
        let peakI = 0;
        for(let i = 0; i <= GRID; i++){
            const x = lo + span * i / GRID;
            let s = 0;
            for (const c of contribs)s += bump(Math.abs(x - c), W);
            s *= norm;
            units.push(s);
            if (s > localMax) {
                localMax = s;
                peakI = i;
            }
        }
        const mean = contribs.reduce((a, b)=>a + b, 0) / contribs.length;
        const peakC = lo + span * peakI / GRID;
        return {
            node,
            idx,
            contribs,
            lo,
            hi,
            span,
            units,
            mean,
            localMax,
            peakC
        };
    });
    const globalMax = Math.max(...sampled.map((s)=>s.localMax), 1e-6);
    // px-Faktor: H px je Einheit. Bei Überlauf herunterskalieren; im normalisierten
    // Modus zusätzlich hochskalieren, damit der höchste Grat den Rahmen füllt
    // (sonst würden flächengleiche, breite Themen unleserlich flach).
    let factor = H;
    const peak = globalMax * factor;
    const FILL = 0.9 * AVAIL;
    if (peak > AVAIL) factor *= AVAIL / peak;
    else if (normalize && peak < FILL) factor *= FILL / peak;
    // 2. Pass: Pfade + Gipfel-Anker. Seeded „Berglinie": Noise proportional zur
    //    lokalen Grathöhe ⇒ Zacken am Gipfel stark, am Fuss/im Tal exakt null.
    //    Anker = HÖCHSTER GEZEICHNETER Punkt (inkl. Jitter), damit der Ring exakt
    //    auf der sichtbaren Spitze sitzt und nicht unter der glatten Hüllkurve.
    const chains = sampled.map((s)=>{
        const noise = noiseFn(hash(s.node.name));
        const pts = [
            `${xPx(s.lo).toFixed(1)},${BASE_Y}`
        ];
        let topX = xPx(s.peakC);
        let topY = BASE_Y;
        for(let i = 0; i <= GRID; i++){
            const x = s.lo + s.span * i / GRID;
            const drawn = s.units[i] * factor; // px-Höhe an dieser Stelle
            const j = noise(i / GRID) * drawn * jitter;
            const y = Math.min(BASE_Y, BASE_Y - drawn - j);
            if (y < topY) {
                topY = y;
                topX = xPx(x);
            }
            pts.push(`${xPx(x).toFixed(1)},${y.toFixed(1)}`);
        }
        pts.push(`${xPx(s.hi).toFixed(1)},${BASE_Y}`);
        return {
            node: s.node,
            idx: s.idx,
            contribs: s.contribs,
            mean: s.mean,
            d: "M" + pts.join(" L") + " Z",
            peakX: topX,
            peakY: topY,
            lines: wrapLabel(s.node.name),
            slotX: topX,
            depth: 0,
            shift: 0
        };
    });
    assignDepth(chains);
    layoutLabels(chains);
    return chains;
}
// Gestapelter Modus: alle Ketten teilen ein gemeinsames Gitter und werden
// kumulativ aufeinandergesetzt — die Oberkante einer Kette ist der Boden der
// nächsten (lückenlos). Gesamthöhe = Summe aller Ketten ⇒ man liest die
// Komposition statt der Überlagerung.
function buildStacked(prepared, W, H, jitter, normalize) {
    const allC = prepared.flatMap((p)=>p.contribs);
    const lo = Math.max(-1.1, Math.min(...allC) - W);
    const hi = Math.min(1.1, Math.max(...allC) + W);
    const span = hi - lo || 0.001;
    const xs = [];
    for(let i = 0; i <= GRID; i++)xs.push(lo + span * i / GRID);
    // Dichte je Kette auf dem gemeinsamen Gitter (normalisiert = gleiche Fläche).
    const layers = prepared.map(({ node, idx, contribs })=>{
        const norm = normalize ? 1 / contribs.length : 1;
        const units = xs.map((x)=>{
            let s = 0;
            for (const c of contribs)s += bump(Math.abs(x - c), W);
            return s * norm;
        });
        const mean = contribs.reduce((a, b)=>a + b, 0) / contribs.length;
        return {
            node,
            idx,
            contribs,
            units,
            mean
        };
    });
    // Höchste Spaltensumme bestimmt die Skalierung (höchster Stapel füllt Rahmen).
    let colMax = 1e-6;
    for(let i = 0; i <= GRID; i++){
        let sum = 0;
        for (const l of layers)sum += l.units[i];
        if (sum > colMax) colMax = sum;
    }
    const factor = Math.min(H * 4, 0.92 * AVAIL / colMax);
    // kumulativ stapeln (untere Kette zuerst, deterministisch nach idx).
    const cum = new Array(GRID + 1).fill(BASE_Y);
    const order = layers.slice().sort((a, b)=>a.idx - b.idx);
    const chains = order.map((l, rank)=>{
        const noise = noiseFn(hash(l.node.name));
        // Anker = wo die EIGENE Dichte des Themas maximal ist (nicht der kumulierte
        // Gipfel, der von den unteren Ketten abhängt).
        let peakIdx = 0;
        for(let i = 1; i <= GRID; i++)if (l.units[i] > l.units[peakIdx]) peakIdx = i;
        const top = [];
        for(let i = 0; i <= GRID; i++){
            const drawn = l.units[i] * factor;
            // Jitter ∝ Dicke ⇒ Faktor (1 + jitter·noise) bleibt > 0; Band kippt nie.
            const thick = Math.max(0, drawn * (1 + jitter * noise(i / GRID)));
            top.push(cum[i] - thick);
        }
        const topX = xPx(xs[peakIdx]);
        const topY = top[peakIdx]; // auf der Bandoberkante beim Themen-Peak
        const pts = [];
        for(let i = 0; i <= GRID; i++)pts.push(`${xPx(xs[i]).toFixed(1)},${top[i].toFixed(1)}`);
        for(let i = GRID; i >= 0; i--)pts.push(`${xPx(xs[i]).toFixed(1)},${cum[i].toFixed(1)}`);
        for(let i = 0; i <= GRID; i++)cum[i] = top[i]; // Boden der nächsten Kette
        return {
            node: l.node,
            idx: l.idx,
            contribs: l.contribs,
            mean: l.mean,
            d: "M" + pts.join(" L") + " Z",
            peakX: topX,
            peakY: topY,
            lines: wrapLabel(l.node.name),
            slotX: topX,
            depth: rank,
            shift: 0
        };
    });
    layoutLabels(chains);
    return chains;
}
// Tiefen-Reihenfolge & versetzte Grundlinien (nur überlagerter Modus): kürzeste
// Kette nach hinten (depth 0, hell, Grundlinie am höchsten = ferner), höchste
// nach vorne (dunkel, Grundlinie unten). Erzeugt die gestaffelte Bergketten-Tiefe.
function assignDepth(chains) {
    const n = chains.length;
    const STEP = 10; // px Versatz je Tiefenstufe
    const byHeight = chains.slice().sort((a, b)=>b.peakY - a.peakY); // niedrigste zuerst
    byHeight.forEach((c, rank)=>{
        c.depth = rank;
        c.shift = (n - 1 - rank) * STEP; // hinten am höchsten angehoben
    });
}
// Themenname in max. 2 Zeilen umbrechen, Rest mit Ellipse.
function wrapLabel(name) {
    const MAX = 15;
    const MAX_LINES = 2;
    const words = name.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words){
        const cand = cur ? cur + " " + w : w;
        if (cand.length <= MAX || !cur) {
            cur = cand;
        } else {
            lines.push(cur);
            cur = w;
            if (lines.length === MAX_LINES) break;
        }
    }
    if (cur && lines.length < MAX_LINES) lines.push(cur);
    const full = name.replace(/\s+/g, " ").length;
    if (lines.join(" ").length < full && lines.length === MAX_LINES) {
        let last = lines[MAX_LINES - 1];
        if (last.length > MAX - 1) last = last.slice(0, MAX - 1);
        lines[MAX_LINES - 1] = last.replace(/\s+$/, "") + "…";
    } else if (lines.length && lines[lines.length - 1].length > MAX) {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, MAX - 1) + "…";
    }
    return lines;
}
// Label-Slots im oberen Band: nahe am Gipfel-x, aber minimal auseinander-
// geschoben (1D-Non-Overlap), kreuzungsfrei.
function layoutLabels(chains) {
    const CHAR_W = 6.3;
    const SLOT_PAD = 12;
    const SLOT_MIN = 36;
    const SLOT_MAX = 644;
    const byX = chains.slice().sort((a, b)=>a.peakX - b.peakX);
    const widths = byX.map((c)=>Math.max(...c.lines.map((l)=>l.length)) * CHAR_W + SLOT_PAD);
    const slots = byX.map((c)=>c.peakX);
    for(let i = 1; i < slots.length; i++){
        const minX = slots[i - 1] + (widths[i - 1] + widths[i]) / 2;
        if (slots[i] < minX) slots[i] = minX;
    }
    if (slots.length) {
        const last = slots.length - 1;
        if (slots[last] + widths[last] / 2 > SLOT_MAX) slots[last] = SLOT_MAX - widths[last] / 2;
        for(let i = last - 1; i >= 0; i--){
            const maxX = slots[i + 1] - (widths[i + 1] + widths[i]) / 2;
            if (slots[i] > maxX) slots[i] = maxX;
        }
        if (slots[0] - widths[0] / 2 < SLOT_MIN) slots[0] = SLOT_MIN + widths[0] / 2;
    }
    byX.forEach((c, i)=>{
        c.slotX = slots[i];
    });
}
// Label-Band-Geometrie (oben im viewBox).
const LABEL_TOP = 20; // Baseline erste Zeile
const LABEL_LINE_H = 13;
const labelBaseY = (lines)=>LABEL_TOP + (lines - 1) * LABEL_LINE_H;
function TopicPanorama({ nodes, t, argWidth = DEFAULT_W, argHeight = DEFAULT_H, ridgeJitter = DEFAULT_JITTER, normalizeArea = true }) {
    const [stacked, setStacked] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const chains = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>buildChains(nodes, argWidth, argHeight, ridgeJitter, normalizeArea, stacked), [
        nodes,
        argWidth,
        argHeight,
        ridgeJitter,
        normalizeArea,
        stacked
    ]);
    const [active, setActive] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    if (!nodes.length) return null;
    const n = chains.length;
    // Zeichnen hinten → vorne (depth aufsteigend), damit nähere Berge die ferneren
    // überlappen. Gestapelt: depth = Stapelrang, also dieselbe Reihenfolge.
    const drawOrder = stacked ? chains : chains.slice().sort((a, b)=>a.depth - b.depth);
    const dim = (idx)=>active != null && active !== idx;
    const activeC = active != null ? chains.find((c)=>c.idx === active) : null;
    const info = activeC ? `${activeC.node.name} · n=${activeC.contribs.length} · ⌀ ${signed(activeC.mean)}` : t("panoramaHint");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
        className: "border-black/5 py-5",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "px-4",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mb-0.5 flex items-start justify-between gap-3",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm font-medium text-foreground/90",
                            children: t("panoramaTitle")
                        }, void 0, false, {
                            fileName: "[project]/src/components/topic-panorama.tsx",
                            lineNumber: 459,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            className: "flex shrink-0 cursor-pointer items-center gap-1.5 text-[12.5px] text-muted-foreground select-none",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    type: "checkbox",
                                    className: "h-3.5 w-3.5 cursor-pointer accent-current",
                                    checked: stacked,
                                    onChange: (e)=>setStacked(e.target.checked)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/topic-panorama.tsx",
                                    lineNumber: 463,
                                    columnNumber: 13
                                }, this),
                                t("panoramaStack")
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/topic-panorama.tsx",
                            lineNumber: 462,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/topic-panorama.tsx",
                    lineNumber: 458,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-3 text-[13px] leading-snug text-muted-foreground",
                    children: t("panoramaSubtitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/topic-panorama.tsx",
                    lineNumber: 472,
                    columnNumber: 9
                }, this),
                chains.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "py-6 text-center text-[13px] text-muted-foreground",
                    children: t("unrated")
                }, void 0, false, {
                    fileName: "[project]/src/components/topic-panorama.tsx",
                    lineNumber: 477,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                            viewBox: "0 0 680 300",
                            role: "img",
                            className: "block h-auto w-full",
                            "aria-label": t("panoramaTitle"),
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("defs", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("linearGradient", {
                                            id: "pano-bg",
                                            x1: "0",
                                            y1: "0",
                                            x2: "0",
                                            y2: "1",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("stop", {
                                                    offset: "0%",
                                                    stopColor: rgbOf(HAZE_RGB, 0.45)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/topic-panorama.tsx",
                                                    lineNumber: 491,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("stop", {
                                                    offset: "65%",
                                                    stopColor: rgbOf(HAZE_RGB, 0)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/topic-panorama.tsx",
                                                    lineNumber: 492,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/topic-panorama.tsx",
                                            lineNumber: 490,
                                            columnNumber: 17
                                        }, this),
                                        chains.map((c)=>{
                                            const top = depthColor(c.depth, n);
                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("linearGradient", {
                                                id: `pano-g-${c.idx}`,
                                                x1: "0",
                                                y1: "0",
                                                x2: "0",
                                                y2: "1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("stop", {
                                                        offset: "0%",
                                                        stopColor: rgbOf(top)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/topic-panorama.tsx",
                                                        lineNumber: 506,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("stop", {
                                                        offset: "100%",
                                                        stopColor: rgbOf(mix(top, HAZE_RGB, 0.5))
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/topic-panorama.tsx",
                                                        lineNumber: 507,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, `g-${c.idx}`, true, {
                                                fileName: "[project]/src/components/topic-panorama.tsx",
                                                lineNumber: 498,
                                                columnNumber: 21
                                            }, this);
                                        })
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/topic-panorama.tsx",
                                    lineNumber: 488,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                    x: 0,
                                    y: 0,
                                    width: 680,
                                    height: BASE_Y,
                                    fill: "url(#pano-bg)"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/topic-panorama.tsx",
                                    lineNumber: 512,
                                    columnNumber: 15
                                }, this),
                                drawOrder.map((c)=>{
                                    const faded = dim(c.idx);
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        d: c.d,
                                        transform: c.shift ? `translate(0 ${-c.shift})` : undefined,
                                        fill: `url(#pano-g-${c.idx})`,
                                        stroke: rgbOf(mix(depthColor(c.depth, n), [
                                            16,
                                            22,
                                            36
                                        ], 0.4)),
                                        strokeOpacity: faded ? 0.25 : active === c.idx ? 1 : 0.7,
                                        strokeWidth: active === c.idx ? 1.6 : 0.9,
                                        strokeLinejoin: "round",
                                        opacity: faded ? 0.4 : 1,
                                        style: {
                                            cursor: "pointer",
                                            transition: "opacity .12s, stroke-opacity .12s"
                                        },
                                        onMouseEnter: ()=>setActive(c.idx),
                                        onMouseLeave: ()=>setActive(null)
                                    }, c.idx, false, {
                                        fileName: "[project]/src/components/topic-panorama.tsx",
                                        lineNumber: 518,
                                        columnNumber: 19
                                    }, this);
                                }),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                    x1: 20,
                                    y1: BASE_Y,
                                    x2: 640,
                                    y2: BASE_Y,
                                    stroke: "var(--border)",
                                    strokeWidth: 0.5
                                }, void 0, false, {
                                    fileName: "[project]/src/components/topic-panorama.tsx",
                                    lineNumber: 536,
                                    columnNumber: 15
                                }, this),
                                chains.map((c)=>c.contribs.map((v, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: xPx(v),
                                            y1: BASE_Y,
                                            x2: xPx(v),
                                            y2: BASE_Y - 6,
                                            stroke: rgbOf(depthColor(c.depth, n)),
                                            strokeOpacity: dim(c.idx) ? 0.15 : 0.7,
                                            strokeWidth: 1
                                        }, `tk-${c.idx}-${i}`, false, {
                                            fileName: "[project]/src/components/topic-panorama.tsx",
                                            lineNumber: 547,
                                            columnNumber: 19
                                        }, this))),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                    x1: 340,
                                    y1: BASE_Y - 8,
                                    x2: 340,
                                    y2: BASE_Y + 8,
                                    stroke: "var(--line-mid)",
                                    strokeWidth: 0.5,
                                    strokeDasharray: "3 3"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/topic-panorama.tsx",
                                    lineNumber: 560,
                                    columnNumber: 15
                                }, this),
                                chains.map((c)=>{
                                    const yTop = labelBaseY(c.lines.length) + 4;
                                    const ringY = c.peakY - c.shift;
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("polyline", {
                                        points: `${c.peakX},${(ringY - 4).toFixed(1)} ${c.peakX},${(yTop + 6).toFixed(1)} ${c.slotX.toFixed(1)},${yTop.toFixed(1)}`,
                                        fill: "none",
                                        stroke: "var(--muted-foreground)",
                                        strokeOpacity: dim(c.idx) ? 0.15 : active === c.idx ? 0.8 : 0.4,
                                        strokeWidth: 0.5
                                    }, `l-${c.idx}`, false, {
                                        fileName: "[project]/src/components/topic-panorama.tsx",
                                        lineNumber: 576,
                                        columnNumber: 19
                                    }, this);
                                }),
                                chains.map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                        cx: c.peakX,
                                        cy: c.peakY - c.shift,
                                        r: active === c.idx ? 4 : 3.5,
                                        fill: "var(--card)",
                                        stroke: active === c.idx ? "var(--foreground)" : "var(--muted-foreground)",
                                        strokeOpacity: dim(c.idx) ? 0.3 : 1,
                                        strokeWidth: 1.6
                                    }, `pk-${c.idx}`, false, {
                                        fileName: "[project]/src/components/topic-panorama.tsx",
                                        lineNumber: 590,
                                        columnNumber: 17
                                    }, this)),
                                chains.map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                        x: c.slotX,
                                        textAnchor: "middle",
                                        fontSize: 12,
                                        fontWeight: active === c.idx ? 600 : 400,
                                        fill: dim(c.idx) ? "var(--muted-foreground)" : active === c.idx ? "var(--foreground)" : "var(--muted-foreground)",
                                        opacity: dim(c.idx) ? 0.45 : 1,
                                        style: {
                                            cursor: "pointer"
                                        },
                                        onMouseEnter: ()=>setActive(c.idx),
                                        onMouseLeave: ()=>setActive(null),
                                        children: c.lines.map((ln, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tspan", {
                                                x: c.slotX,
                                                y: LABEL_TOP + i * LABEL_LINE_H,
                                                children: ln
                                            }, i, false, {
                                                fileName: "[project]/src/components/topic-panorama.tsx",
                                                lineNumber: 625,
                                                columnNumber: 21
                                            }, this))
                                    }, `t-${c.idx}`, false, {
                                        fileName: "[project]/src/components/topic-panorama.tsx",
                                        lineNumber: 606,
                                        columnNumber: 17
                                    }, this)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                    x: 24,
                                    y: 292,
                                    textAnchor: "start",
                                    fontSize: 12,
                                    fill: "var(--muted-foreground)",
                                    children: [
                                        "← ",
                                        t("panoramaNo")
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/topic-panorama.tsx",
                                    lineNumber: 633,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                    x: 340,
                                    y: 292,
                                    textAnchor: "middle",
                                    fontSize: 12,
                                    fill: "var(--muted-foreground)",
                                    children: t("neutral")
                                }, void 0, false, {
                                    fileName: "[project]/src/components/topic-panorama.tsx",
                                    lineNumber: 642,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                    x: 636,
                                    y: 292,
                                    textAnchor: "end",
                                    fontSize: 12,
                                    fill: "var(--muted-foreground)",
                                    children: [
                                        t("panoramaYes"),
                                        " →"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/topic-panorama.tsx",
                                    lineNumber: 651,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/topic-panorama.tsx",
                            lineNumber: 482,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-2 min-h-5 text-[13px] tabular-nums text-muted-foreground",
                            children: info
                        }, void 0, false, {
                            fileName: "[project]/src/components/topic-panorama.tsx",
                            lineNumber: 662,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/topic-panorama.tsx",
            lineNumber: 457,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/topic-panorama.tsx",
        lineNumber: 456,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = TopicPanorama;
}),
"[project]/src/components/taxonomy-sunburst.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TaxonomySunburst",
    ()=>TaxonomySunburst,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
/**
 * Taxonomie-Sunburst — die Themen-Hierarchie als konzentrische Ringe (Zentrum =
 * Ballot, Ring 1 = Hauptthemen, weitere Ringe = Subthemen). Ergänzt das
 * Positionsband um die ganze Tiefe der Hierarchie auf einen Blick.
 *
 * Farbe = `proLeaning` ∈ [-1,1] des Viewers (relevanz-gewichtete Pro-Vorlage-
 * Neigung) als kontinuierliche diverging-Skala: rot (auf Gegner-Seite) → grau
 * (neutral) → blau (auf Befürworter-Seite). Unbewertet/ohne Login = weiss
 * (mit feinem Umriss). Stark gespaltene Knoten (hoher `dissent`) bekommen einen
 * Amber-Rand — sie sind nicht indifferent, sondern hin- und hergerissen.
 *
 * Segmentgröße: alle Geschwister gleich breit (Winkel des Elternsegments / Anzahl
 * Geschwister) — die Visualisierung zeigt Struktur & Haltung, nicht Volumen.
 *
 * Reines SVG, keine Chart-Library.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
// dissent darüber ⇒ Knoten gilt als „gespalten" (hoher Dissens) ⇒ Amber-Rand.
const SPLIT_THRESHOLD = 0.5;
// Pole — konsistent mit Positionsband / Insight.
const RED = [
    178,
    58,
    33
]; // Gegner-Seite
const BLUE = [
    37,
    99,
    235
]; // Befürworter-Seite
const MID = [
    233,
    230,
    224
]; // neutrale Mitte (warmes Grau)
const AMBER = "rgb(217, 159, 40)"; // Rand + Hinweis für stark gespaltene Knoten
// Entsättigung: jeder bewertete Ton wird Richtung Hellgrau gemischt, damit die
// kräftigen Pole weicher wirken. Unbewertete Segmente gehen auf sehr helles Grau
// und treten so klar hinter die bewerteten zurück.
const DESAT = [
    244,
    244,
    245
]; // #f4f4f5 (zinc-100)
const DESAT_T = 0.28; // ~28 % Richtung Hellgrau
const UNRATED = [
    255,
    255,
    255
]; // unbewertet = weiss (mit feinem Umriss)
// Geometrie
const SIZE = 420;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CENTER_R = 30; // Radius der Zentrumsscheibe (kleines Loch → mehr Ringfläche)
const CENTER_R_COMPACT = 20; // Mobile: kleineres Loch ⇒ Ring 1 bekommt mehr Platz
const OUTER_R = 206; // äusserster Radius (fast bis an den Rand → mehr Textplatz)
const LABEL_MIN_ANGLE = 9; // ° — schmaler ⇒ kein Label (nur Tooltip)
const LABEL_R_FRAC = 0.62; // Label-Position im Ring: >0.5 ⇒ nach aussen (mehr Bogenlänge)
const LABEL_OUTER_PAD = 11; // Compact: Abstand der äussersten Label-Zeile vom Ringrand
const CORNER_R = 4; // abgerundete Segment-Ecken
const PAD_DEG = 1.4; // ° Luft zwischen Segmenten (statt Trennlinien)
const RING_GAP = 3; // radiale Lücke zwischen den Ring-Ebenen
const OUTER_OPACITY = 0.62; // Deckkraft des äussersten Rings (innen = 1)
const MAX_LEVELS = 3; // nie mehr als 3 Ringe zeichnen (4. Ebene wird weggelassen)
const THIRD_RING_WIDTH = 16; // 3. Ring nur als dünnes Band; Ebene 1 & 2 teilen den Rest
// Mobile-Variante (`compact`): 2. Ring als Band, etwas länger als der 3. Ring;
// Ring 1 bekommt den ganzen Rest (einziger beschrifteter Ring).
const SECOND_RING_COMPACT_W = 34;
function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
}
function mixT(c1, c2, t) {
    return [
        lerp(c1[0], c2[0], t),
        lerp(c1[1], c2[1], t),
        lerp(c1[2], c2[2], t)
    ];
}
function rgb(c) {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
// proLeaning -1..1 → diverging rot↔neutral↔blau, entsättigt; null = helles Grau.
function fillFor(lean) {
    if (lean == null) return rgb(UNRATED);
    const base = lean >= 0 ? mixT(MID, BLUE, Math.min(1, lean)) : mixT(MID, RED, Math.min(1, -lean));
    return rgb(mixT(base, DESAT, DESAT_T));
}
// proLeaning -1..1 → i18n-Key der 5-stufigen Ja↔Nein-Position (Zentrums-Label).
// Symmetrisch um 0; spiegelt die Legende „Näher bei den Ja/Nein-Argumenten".
function leaningKey(lean) {
    if (lean == null) return "sunburstLeanUnrated";
    if (lean <= -0.5) return "sunburstLeanStrongNo";
    if (lean <= -0.15) return "sunburstLeanNo";
    if (lean < 0.15) return "sunburstLeanBalanced";
    if (lean < 0.5) return "sunburstLeanYes";
    return "sunburstLeanStrongYes";
}
// Dunkle Töne aus derselben Farbfamilie wie die Füllung — für Label-Text ohne
// harten Weiss-Kontrast / Halo.
const DARK_BLUE = [
    28,
    52,
    120
]; // dunkles Blau
const DARK_RED = [
    112,
    34,
    20
]; // dunkles Rot
const DARK_NEUTRAL = [
    88,
    86,
    92
]; // mittleres Grau
// Label-Farbe = dunkle Variante der Segment-Hue: blau→dunkelblau, rot→dunkelrot,
// neutral→mittelgrau. Schwache Neigung mischt Richtung Grau (folgt der Füllung).
function textColor(lean) {
    if (lean == null) return rgb(DARK_NEUTRAL);
    const strength = Math.min(1, Math.abs(lean));
    const dark = lean >= 0 ? DARK_BLUE : DARK_RED;
    return rgb(mixT(DARK_NEUTRAL, dark, strength));
}
// Label an Wortgrenzen auf bis zu maxLines Zeilen umbrechen; Überlauf mit „…".
// Mit `hyphenate` werden zu lange Einzelwörter über mehrere Zeilen mit Bindestrich
// gebrochen (füllt den Platz, zeigt den ganzen Namen) statt abgeschnitten.
function wrapLabel(name, maxChars, maxLines, hyphenate = false) {
    const words = name.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    // Ein (zu langes) Wort silbenlos mit „-" auf so viele Zeilen wie nötig brechen,
    // solange noch Zeilen frei sind; der Rest landet in `cur`.
    const hyphenateWord = (w)=>{
        while(hyphenate && w.length > maxChars && lines.length < maxLines - 1){
            lines.push(`${w.slice(0, maxChars - 1)}-`);
            w = w.slice(maxChars - 1);
        }
        return w;
    };
    for (let w of words){
        if (lines.length >= maxLines) break;
        if (hyphenate && !cur && w.length > maxChars) {
            cur = hyphenateWord(w);
            continue;
        }
        const candidate = cur ? `${cur} ${w}` : w;
        if (!cur || candidate.length <= maxChars || lines.length >= maxLines - 1) {
            cur = candidate; // erstes Wort, passt, oder letzte erlaubte Zeile (wird ggf. gekürzt)
        } else {
            lines.push(cur);
            cur = hyphenateWord(w);
        }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    return lines.slice(0, maxLines).map((l)=>l.length > maxChars ? `${l.slice(0, Math.max(1, maxChars - 1))}…` : l);
}
function polar(r, angleDeg) {
    const a = (angleDeg - 90) * Math.PI / 180;
    return [
        CX + r * Math.cos(a),
        CY + r * Math.sin(a)
    ];
}
// Ringsegment als Pfad. Mit abgerundeten Ecken (cr): an jeder der vier Ecken
// wird die scharfe Spitze durch einen kleinen Bogen ersetzt — clamped auf die
// radiale Dicke und die Winkelbreite, damit schmale Segmente nicht kollabieren.
function arcPath(rInner, rOuter, a0, a1, cr = CORNER_R) {
    const spanDeg = a1 - a0;
    if (spanDeg <= 0) return "";
    const sharp = ()=>{
        const large = spanDeg > 180 ? 1 : 0;
        const [x0o, y0o] = polar(rOuter, a0);
        const [x1o, y1o] = polar(rOuter, a1);
        const [x1i, y1i] = polar(rInner, a1);
        const [x0i, y0i] = polar(rInner, a0);
        return [
            `M ${x0o} ${y0o}`,
            `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o}`,
            `L ${x1i} ${y1i}`,
            `A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i}`,
            "Z"
        ].join(" ");
    };
    // Eckradius auf radiale Dicke und (halbe) Bogenlänge je Radius begrenzen.
    const halfSpanRad = spanDeg / 2 * Math.PI / 180;
    const r = Math.min(cr, (rOuter - rInner) / 2, halfSpanRad * rInner, halfSpanRad * rOuter);
    if (r < 0.75) return sharp();
    const degO = r / rOuter * 180 / Math.PI; // Winkel-Inset auf Aussenbogen
    const degI = r / rInner * 180 / Math.PI; // Winkel-Inset auf Innenbogen
    const largeO = spanDeg - 2 * degO > 180 ? 1 : 0;
    const largeI = spanDeg - 2 * degI > 180 ? 1 : 0;
    const p1 = polar(rOuter, a0 + degO); // Aussenbogen Start
    const p2 = polar(rOuter, a1 - degO); // Aussenbogen Ende
    const p3 = polar(rOuter - r, a1); // Radialkante a1 (aussen)
    const p4 = polar(rInner + r, a1); // Radialkante a1 (innen)
    const p5 = polar(rInner, a1 - degI); // Innenbogen Start
    const p6 = polar(rInner, a0 + degI); // Innenbogen Ende
    const p7 = polar(rInner + r, a0); // Radialkante a0 (innen)
    const p8 = polar(rOuter - r, a0); // Radialkante a0 (aussen)
    return [
        `M ${p1[0]} ${p1[1]}`,
        `A ${rOuter} ${rOuter} 0 ${largeO} 1 ${p2[0]} ${p2[1]}`,
        `A ${r} ${r} 0 0 1 ${p3[0]} ${p3[1]}`,
        `L ${p4[0]} ${p4[1]}`,
        `A ${r} ${r} 0 0 1 ${p5[0]} ${p5[1]}`,
        `A ${rInner} ${rInner} 0 ${largeI} 0 ${p6[0]} ${p6[1]}`,
        `A ${r} ${r} 0 0 1 ${p7[0]} ${p7[1]}`,
        `L ${p8[0]} ${p8[1]}`,
        `A ${r} ${r} 0 0 1 ${p1[0]} ${p1[1]}`,
        "Z"
    ].join(" ");
}
// Bogen-Mittellinie als Pfad für gekrümmten Text (<textPath>). Untere Hälfte
// umgekehrt zeichnen, damit der Text aufrecht statt kopfüber steht.
function textArcPath(r, a0, a1, flip) {
    const [s0, s1] = flip ? [
        a1,
        a0
    ] : [
        a0,
        a1
    ];
    const [xs, ys] = polar(r, s0);
    const [xe, ye] = polar(r, s1);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const sweep = flip ? 0 : 1;
    return `M ${xs} ${ys} A ${r} ${r} 0 ${large} ${sweep} ${xe} ${ye}`;
}
// Equal-share-Layout: jedes Geschwister bekommt denselben Winkelanteil.
// Nur bis MAX_LEVELS Ebenen — tiefere Ebenen werden gar nicht erfasst/gezeichnet.
function layout(root) {
    const segs = [];
    let maxLevel = 0;
    const walk = (node, level, a0, a1)=>{
        if (level >= 1) {
            segs.push({
                node,
                level,
                a0,
                a1
            });
            if (level > maxLevel) maxLevel = level;
        }
        if (level >= MAX_LEVELS) return; // 4. Ebene nie zeichnen
        const kids = node.children ?? [];
        if (!kids.length) return;
        const step = (a1 - a0) / kids.length;
        kids.forEach((c, i)=>walk(c, level + 1, a0 + i * step, a0 + (i + 1) * step));
    };
    walk(root, 0, 0, 360);
    return {
        segs,
        maxLevel
    };
}
// Ring-Grenzradien je Ebenenzahl. Bei 3 Ebenen bekommt der äusserste Ring nur
// THIRD_RING_WIDTH (dünnes Band); Ebene 1 & 2 teilen den verbleibenden Platz.
// Rückgabe: radii[level-1]..radii[level] = [Innen, Aussen] des Rings `level`.
function ringRadii(levels, compact = false) {
    if (levels <= 1) return [
        CENTER_R,
        OUTER_R
    ];
    if (compact) {
        // Mobile: nur Ring 1 beschriftet ⇒ ihm den Grossteil des Platzes geben
        // (kleineres Mittelloch); Ring 2 & 3 sind reine Bänder (Ring 2 etwas länger).
        if (levels === 2) return [
            CENTER_R_COMPACT,
            OUTER_R - SECOND_RING_COMPACT_W,
            OUTER_R
        ];
        const inner3 = OUTER_R - THIRD_RING_WIDTH;
        const inner2 = inner3 - SECOND_RING_COMPACT_W;
        return [
            CENTER_R_COMPACT,
            inner2,
            inner3,
            OUTER_R
        ];
    }
    if (levels === 2) {
        const step = (OUTER_R - CENTER_R) / 2;
        return [
            CENTER_R,
            CENTER_R + step,
            OUTER_R
        ];
    }
    const inner = OUTER_R - THIRD_RING_WIDTH; // Beginn des dünnen 3. Rings
    const step = (inner - CENTER_R) / 2;
    return [
        CENTER_R,
        CENTER_R + step,
        inner,
        OUTER_R
    ];
}
function TaxonomySunburst({ root, t, onSelect, compact = false }) {
    const [hover, setHover] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const { segs, radii, maxLevel } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const { segs, maxLevel } = layout(root);
        const radii = ringRadii(maxLevel, compact);
        return {
            segs,
            radii,
            maxLevel
        };
    }, [
        root,
        compact
    ]);
    if (!segs.length) return null;
    // Einebenig (nur Top-Topics) ⇒ grössere Labels, da der eine Ring sehr dick ist;
    // ab zwei Ebenen kompakt. Compact: nur Ring 1 trägt Labels und ist dick ⇒ gross.
    const labelFont = compact ? 13 : maxLevel <= 1 ? 13 : 10;
    // Chart-Breite: einebenig/compact kompakt, mehrebenig grösser.
    const chartMaxW = maxLevel <= 1 ? 440 : 680;
    // Standardmässig kein Panel; nur beim Hover erscheint Titel + Bewertung seitlich.
    const active = hover;
    const lean = active?.proLeaning;
    const ratingLabel = active ? t(leaningKey(lean)) : "";
    // Farbe = Seite (blau/rot), abgedunkelt für Lesbarkeit; Stufe sagt der Text.
    const ratingColor = lean == null ? "rgba(0,0,0,0.5)" : rgb(mixT(lean >= 0 ? BLUE : RED, [
        30,
        30,
        30
    ], 0.15));
    // Gespalten (hoher dissent) ⇒ Amber-Hinweis im Panel, passend zum Amber-Rand.
    const activeSplit = !!active && (active.dissent ?? 0) > SPLIT_THRESHOLD;
    // Panel auf die dem Segment gegenüberliegende Seite legen (Winkel 0–180 = rechte
    // Hälfte → Panel links, sonst rechts), damit es das aktive Segment nicht verdeckt.
    const activeSeg = active ? segs.find((s)=>s.node === active) : undefined;
    const activeMid = activeSeg ? (activeSeg.a0 + activeSeg.a1) / 2 : 0;
    const panelSide = activeMid > 0 && activeMid < 180 ? "left" : "right";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
        className: "border-black/5 py-5",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "px-4",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-0.5 text-sm font-medium text-foreground/90",
                    children: t("sunburstTitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 323,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-3 text-[13px] leading-snug text-muted-foreground",
                    children: t("sunburstSubtitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 324,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `relative w-full ${compact ? "-mx-4 max-w-none" : "mx-auto"}`,
                    style: compact ? undefined : {
                        maxWidth: chartMaxW
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                            viewBox: `0 0 ${SIZE} ${SIZE}`,
                            className: "h-auto w-full",
                            role: "img",
                            "aria-label": t("sunburstTitle"),
                            children: [
                                segs.map((s)=>{
                                    // Radiale Lücke zwischen den Ebenen: jedes Band beidseitig einrücken.
                                    const rInner = radii[s.level - 1] + RING_GAP / 2;
                                    const rOuter = radii[s.level] - RING_GAP / 2;
                                    const thickness = rOuter - rInner; // Ringdicke (3. Ring ist dünn)
                                    const span = s.a1 - s.a0;
                                    // Luft zwischen Segmenten: Winkel beidseitig einschrumpfen
                                    // (höchstens ~⅓ der Breite, damit schmale Segmente bestehen bleiben).
                                    const pad = Math.min(PAD_DEG, span * 0.35) / 2;
                                    const pa0 = s.a0 + pad;
                                    const pa1 = s.a1 - pad;
                                    // Tiefenstaffelung: innen voll deckend, aussen Richtung OUTER_OPACITY.
                                    const depthT = maxLevel > 1 ? (s.level - 1) / (maxLevel - 1) : 0;
                                    const baseOpacity = 1 - depthT * (1 - OUTER_OPACITY);
                                    const unrated = s.node.proLeaning == null; // weiss ⇒ feiner Umriss nötig
                                    // Gespalten = hoher Dissens (Ja- UND Nein-Argumente stark bewertet) ⇒ Amber-Rand.
                                    const split = (s.node.dissent ?? 0) > SPLIT_THRESHOLD;
                                    const clickable = !!s.node.key && !!onSelect;
                                    const mid = (s.a0 + s.a1) / 2;
                                    // Innerster Ring: Text gekrümmt entlang des Bogens; tiefere Ringe radial.
                                    const curved = s.level === 1;
                                    // 2.+ Ebene (radiale Labels) eine Spur kleiner als die Top-Topics.
                                    const segFont = curved ? labelFont : Math.max(8, labelFont - 1);
                                    const segScale = segFont / 10;
                                    const lineGap = 11 * segScale; // radialer Abstand der gekrümmten Zeilen
                                    // Bei gespaltenen radialen Segmenten ein Innenband für den Blitz frei
                                    // halten ⇒ Label zentriert nur im äusseren Rest (kein Overlap).
                                    const boltGap = split && !curved ? 16 : 0;
                                    const labelInnerR = rInner + boltGap;
                                    // Compact-Ring 1 ist dick und der EINZIGE beschriftete Ring ⇒ bis zu
                                    // 4 Zeilen, damit lange Namen (ggf. mit Bindestrich umgebrochen) den
                                    // Platz füllen statt abgeschnitten zu werden.
                                    const maxLines = curved ? compact ? 4 : thickness >= 30 ? 3 : 2 : thickness >= 28 ? 2 : 1;
                                    // Zeichenkapazität an der INNERSTEN möglichen Zeile bemessen (kleinster
                                    // Radius = kürzester Bogen). Compact: worst case = maxLines, am
                                    // Aussenrand verankert — so überläuft auch ein voller Block nie.
                                    const charR = curved ? compact ? rOuter - LABEL_OUTER_PAD - (maxLines - 1) * lineGap : rInner + (rOuter - rInner) * LABEL_R_FRAC - (maxLines - 1) / 2 * lineGap : 0;
                                    const maxChars = curved ? Math.max(3, Math.floor(span / 360 * 2 * Math.PI * charR / (6.5 * segScale))) : Math.max(4, Math.floor((rOuter - labelInnerR - 6) / (5.8 * segScale)));
                                    // Compact: lange Einzelwörter mit Bindestrich umbrechen statt mit „…".
                                    const lines = wrapLabel(s.node.name, maxChars, maxLines, curved && compact);
                                    // Label-Radius aus der TATSÄCHLICHEN Zeilenzahl. Compact: oberste Zeile
                                    // ans Aussenrand-Limit (rOuter − Pad) verankern, Block füllt nach innen
                                    // ⇒ auch kurze Labels sitzen aussen statt mittig zu schweben. Desktop:
                                    // Fraktion wie gehabt.
                                    const labelR = !curved ? (labelInnerR + rOuter) / 2 : compact ? rOuter - LABEL_OUTER_PAD - (lines.length - 1) / 2 * lineGap : rInner + (rOuter - rInner) * LABEL_R_FRAC;
                                    const [lx, ly] = polar(labelR, mid);
                                    // Dünne Ringe (z. B. der 3.) bekommen kein Label — nur Farbe.
                                    // Compact (mobil): ausschliesslich Ring 1 beschriften.
                                    const showLabel = span >= LABEL_MIN_ANGLE && thickness > 22 && (!compact || s.level === 1);
                                    // Radiale Ausrichtung (tiefere Ringe): tangential gedreht, links gespiegelt.
                                    let rot = mid - 90;
                                    if (mid > 180) rot += 180;
                                    // Untere Hälfte: Text-Pfad umkehren, sonst stünde der Text kopfüber.
                                    const flip = mid > 90 && mid < 270;
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                d: arcPath(rInner, rOuter, pa0, pa1),
                                                fill: fillFor(s.node.proLeaning),
                                                stroke: unrated ? "rgba(0,0,0,0.2)" : "none",
                                                strokeWidth: unrated ? 1 : 0,
                                                // Unbewertet ⇒ gestrichelter, „provisorischer" Rand.
                                                strokeDasharray: unrated ? "3 2.5" : undefined,
                                                style: {
                                                    cursor: clickable ? "pointer" : "default",
                                                    opacity: (hover && hover !== s.node ? 0.82 : 1) * baseOpacity,
                                                    transition: "opacity 120ms"
                                                },
                                                onMouseEnter: ()=>setHover(s.node),
                                                onMouseLeave: ()=>setHover((h)=>h === s.node ? null : h),
                                                onClick: ()=>clickable && onSelect(s.node.key)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                lineNumber: 413,
                                                columnNumber: 19
                                            }, this),
                                            split && (()=>{
                                                const [bx, by] = polar(rInner + 10, mid);
                                                const k = 0.6; // 24er-Icon → ~14 px
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                    d: "M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z",
                                                    fill: AMBER,
                                                    transform: `translate(${bx} ${by}) scale(${k}) translate(-12 -12)`,
                                                    style: {
                                                        pointerEvents: "none"
                                                    },
                                                    opacity: (hover && hover !== s.node ? 0.82 : 1) * baseOpacity
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                    lineNumber: 435,
                                                    columnNumber: 25
                                                }, this);
                                            })(),
                                            showLabel && curved && lines.map((line, i)=>{
                                                const n = lines.length;
                                                // Mehrzeilig: Zeilen radial um die Ring-Mittellinie verteilen.
                                                const ri = labelR + (flip ? -1 : 1) * ((n - 1) / 2 - i) * (11 * segScale);
                                                const pid = `lp-${s.node.id}-${s.level}-${i}`;
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                            id: pid,
                                                            d: textArcPath(ri, s.a0, s.a1, flip),
                                                            fill: "none"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                            lineNumber: 453,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                                            fill: textColor(s.node.proLeaning),
                                                            fontSize: segFont,
                                                            style: {
                                                                pointerEvents: "none",
                                                                userSelect: "none"
                                                            },
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textPath", {
                                                                href: `#${pid}`,
                                                                startOffset: "50%",
                                                                textAnchor: "middle",
                                                                children: line
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                                lineNumber: 459,
                                                                columnNumber: 29
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                            lineNumber: 454,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, pid, true, {
                                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                    lineNumber: 452,
                                                    columnNumber: 25
                                                }, this);
                                            }),
                                            showLabel && !curved && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                                x: lx,
                                                y: ly,
                                                fill: textColor(s.node.proLeaning),
                                                fontSize: segFont,
                                                textAnchor: "middle",
                                                dominantBaseline: "central",
                                                transform: `rotate(${rot} ${lx} ${ly})`,
                                                style: {
                                                    pointerEvents: "none",
                                                    userSelect: "none"
                                                },
                                                children: lines.map((line, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tspan", {
                                                        x: lx,
                                                        dy: i === 0 ? `${-(lines.length - 1) * 0.55}em` : "1.1em",
                                                        children: line
                                                    }, `${i}-${line}`, false, {
                                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                        lineNumber: 478,
                                                        columnNumber: 25
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                lineNumber: 467,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, `${s.node.id}-${s.level}`, true, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 412,
                                        columnNumber: 17
                                    }, this);
                                }),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                    cx: CX,
                                    cy: CY,
                                    r: compact ? CENTER_R_COMPACT : CENTER_R,
                                    fill: "var(--card)",
                                    stroke: "rgba(0,0,0,0.05)"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 494,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 332,
                            columnNumber: 11
                        }, this),
                        active && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "pointer-events-none absolute top-1/2 z-10 max-w-[44%] -translate-y-1/2",
                            style: panelSide === "left" ? {
                                left: "2%"
                            } : {
                                right: "2%"
                            },
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-xl border border-black/10 bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm font-medium leading-snug text-foreground/90",
                                        children: active.name
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 512,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-0.5 text-xs font-semibold leading-snug",
                                        style: {
                                            color: ratingColor
                                        },
                                        children: ratingLabel
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 515,
                                        columnNumber: 17
                                    }, this),
                                    activeSplit && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 flex items-center gap-1.5 text-xs font-medium leading-snug",
                                        style: {
                                            color: AMBER
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                viewBox: "0 0 24 24",
                                                className: "h-3.5 w-3.5 shrink-0",
                                                "aria-hidden": "true",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                    d: "M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z",
                                                    fill: AMBER
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                    lineNumber: 527,
                                                    columnNumber: 23
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                lineNumber: 526,
                                                columnNumber: 21
                                            }, this),
                                            t("sunburstDissentNote")
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 522,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                lineNumber: 511,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 507,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 328,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-3 flex items-center justify-center gap-3 text-[13px] font-medium",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                color: `rgb(${RED.join(",")})`
                            },
                            children: t("poleOpponents")
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 539,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "h-2 w-28 rounded-full",
                            style: {
                                background: `linear-gradient(90deg, rgb(${RED.join(",")}), rgb(${MID.join(",")}), rgb(${BLUE.join(",")}))`
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 540,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                color: `rgb(${BLUE.join(",")})`
                            },
                            children: t("poleSupporters")
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 548,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 538,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-1.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex items-center gap-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    viewBox: "2 2.7 16 8",
                                    className: "h-3.5 w-7 shrink-0",
                                    "aria-hidden": "true",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        d: "M 4.84 4.63 A 9 9 0 0 1 15.16 4.63 L 12.29 8.72 A 4 4 0 0 0 7.71 8.72 Z",
                                        fill: fillFor(null),
                                        stroke: "rgba(0,0,0,0.2)",
                                        strokeWidth: 1.2,
                                        strokeDasharray: "2 1.6",
                                        strokeLinejoin: "round"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 556,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 555,
                                    columnNumber: 13
                                }, this),
                                t("sunburstLeanUnrated")
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 554,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex items-center gap-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    viewBox: "0 0 24 24",
                                    className: "h-4 w-4 shrink-0",
                                    "aria-hidden": "true",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        d: "M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z",
                                        fill: AMBER
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 569,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 568,
                                    columnNumber: 13
                                }, this),
                                t("sunburstDissentNote")
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 567,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 553,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
            lineNumber: 322,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
        lineNumber: 321,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = TaxonomySunburst;
}),
"[project]/src/components/taxonomy-icicle.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TaxonomyIcicle",
    ()=>TaxonomyIcicle,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-ssr] (ecmascript)");
"use client";
;
;
// dissent darüber ⇒ Knoten gilt als „gespalten" ⇒ Amber-Rand.
const SPLIT_THRESHOLD = 0.5;
// Pole — konsistent mit Sunburst / Positionsband.
const RED = [
    178,
    58,
    33
]; // Gegner-Seite
const BLUE = [
    37,
    99,
    235
]; // Befürworter-Seite
const MID = [
    233,
    230,
    224
]; // neutrale Mitte (warmes Grau)
const AMBER = "rgb(217, 159, 40)"; // Rand für stark gespaltene Knoten
const DESAT = [
    244,
    244,
    245
]; // #f4f4f5 (zinc-100)
const DESAT_T = 0.28; // ~28 % Richtung Hellgrau
const UNRATED = [
    255,
    255,
    255
]; // unbewertet = weiss
// Layout-Geometrie (HTML-Pixel; Breite skaliert prozentual, Höhe bleibt fix).
const MAX_DEPTH = 3; // Wurzel = 0 (nicht gezeichnet), Ebenen 1..3
const ROW_H = 50; // Höhe einer Ebenen-Zeile
const ROW_GAP = 4; // vertikaler Abstand zwischen den Ebenen
const COL_GAP_PX = 2; // horizontale Luft zwischen Geschwistern
const MIN_SIZE = 1; // Mindestgrösse, damit 0-Argument-Knoten nicht verschwinden
function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
}
function mixT(c1, c2, t) {
    return [
        lerp(c1[0], c2[0], t),
        lerp(c1[1], c2[1], t),
        lerp(c1[2], c2[2], t)
    ];
}
function rgb(c) {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
// proLeaning -1..1 → diverging rot↔neutral↔blau, entsättigt; null = weiss.
function fillFor(lean) {
    if (lean == null) return rgb(UNRATED);
    const base = lean >= 0 ? mixT(MID, BLUE, Math.min(1, lean)) : mixT(MID, RED, Math.min(1, -lean));
    return rgb(mixT(base, DESAT, DESAT_T));
}
// Geschwister-Sortierung links→rechts: aufsteigende Zustimmung (am meisten Nein
// links, am meisten Ja rechts), unbewertete (null) ganz rechts. Stabiler Sort ⇒
// bei gleicher Neigung bleibt die Backend-Reihenfolge erhalten.
function byApprovalAsc(a, b) {
    const la = a.proLeaning ?? Number.POSITIVE_INFINITY;
    const lb = b.proLeaning ?? Number.POSITIVE_INFINITY;
    return la - lb;
}
function sizeOf(node) {
    return Math.max(node.argumentCount ?? 0, MIN_SIZE);
}
// Rekursive Partition: jedes Kind belegt einen zur Grösse proportionalen
// Anteil der horizontalen Spanne des Elternknotens. Blätter vor MAX_DEPTH
// erzeugen keine tieferen Rechtecke ⇒ Weissraum darunter (klassischer Eiszapfen).
function partition(root) {
    const out = [];
    const walk = (node, depth, x0, x1)=>{
        if (depth >= 1) out.push({
            node,
            depth,
            x0,
            x1
        });
        if (depth >= MAX_DEPTH) return;
        const kids = [
            ...node.children ?? []
        ].sort(byApprovalAsc);
        if (!kids.length) return;
        const total = kids.reduce((s, k)=>s + sizeOf(k), 0) || 1;
        let x = x0;
        for (const k of kids){
            const w = (x1 - x0) * (sizeOf(k) / total);
            walk(k, depth + 1, x, x + w);
            x += w;
        }
    };
    walk(root, 0, 0, 1);
    return out;
}
function TaxonomyIcicle({ root, t, onSelect }) {
    const rects = partition(root);
    if (!rects.length) return null;
    const height = MAX_DEPTH * ROW_H + (MAX_DEPTH - 1) * ROW_GAP;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
        className: "border-black/5 py-5",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "px-4",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-0.5 text-sm font-medium text-foreground/90",
                    children: t("sunburstTitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-icicle.tsx",
                    lineNumber: 130,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-3 text-[13px] leading-snug text-muted-foreground",
                    children: t("sunburstSubtitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-icicle.tsx",
                    lineNumber: 131,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "relative w-full",
                    style: {
                        height
                    },
                    children: rects.map((r)=>{
                        const unrated = r.node.proLeaning == null;
                        const split = (r.node.dissent ?? 0) > SPLIT_THRESHOLD;
                        const clickable = !!r.node.key && !!onSelect;
                        // Tiefere Ebenen leicht zurücknehmen (wie die äusseren Sunburst-Ringe).
                        const depthT = (r.depth - 1) / (MAX_DEPTH - 1);
                        const opacity = 1 - depthT * (1 - 0.62);
                        const border = split ? `1.5px solid ${AMBER}` : unrated ? "1px dashed rgba(0,0,0,0.22)" : "1px solid transparent";
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            disabled: !clickable,
                            onClick: clickable ? ()=>onSelect(r.node.key) : undefined,
                            title: r.node.name,
                            "aria-label": r.node.name,
                            style: {
                                position: "absolute",
                                top: (r.depth - 1) * (ROW_H + ROW_GAP),
                                height: ROW_H,
                                left: `calc(${r.x0 * 100}% + ${COL_GAP_PX / 2}px)`,
                                width: `calc(${(r.x1 - r.x0) * 100}% - ${COL_GAP_PX}px)`,
                                background: fillFor(r.node.proLeaning),
                                border,
                                opacity
                            },
                            className: `rounded-[3px] transition-opacity ${clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`
                        }, `${r.node.id}-${r.depth}`, false, {
                            fileName: "[project]/src/components/taxonomy-icicle.tsx",
                            lineNumber: 150,
                            columnNumber: 15
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-icicle.tsx",
                    lineNumber: 136,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-3 flex items-center justify-center gap-3 text-[13px] font-medium",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                color: `rgb(${RED.join(",")})`
                            },
                            children: t("poleOpponents")
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-icicle.tsx",
                            lineNumber: 177,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "h-2 w-28 rounded-full",
                            style: {
                                background: `linear-gradient(90deg, rgb(${RED.join(",")}), rgb(${MID.join(",")}), rgb(${BLUE.join(",")}))`
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-icicle.tsx",
                            lineNumber: 178,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                color: `rgb(${BLUE.join(",")})`
                            },
                            children: t("poleSupporters")
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-icicle.tsx",
                            lineNumber: 186,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-icicle.tsx",
                    lineNumber: 176,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-1.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex items-center gap-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "h-3.5 w-3.5 shrink-0 rounded-[3px]",
                                    style: {
                                        background: fillFor(null),
                                        border: "1px dashed rgba(0,0,0,0.3)"
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-icicle.tsx",
                                    lineNumber: 191,
                                    columnNumber: 13
                                }, this),
                                t("sunburstLeanUnrated")
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-icicle.tsx",
                            lineNumber: 190,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex items-center gap-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "h-3.5 w-3.5 shrink-0 rounded-[3px]",
                                    style: {
                                        background: fillFor(0),
                                        border: `1.5px solid ${AMBER}`
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-icicle.tsx",
                                    lineNumber: 198,
                                    columnNumber: 13
                                }, this),
                                t("sunburstDissentNote")
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-icicle.tsx",
                            lineNumber: 197,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-icicle.tsx",
                    lineNumber: 189,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/taxonomy-icicle.tsx",
            lineNumber: 129,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/taxonomy-icicle.tsx",
        lineNumber: 128,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = TaxonomyIcicle;
}),
"[project]/src/components/locked-section.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GatePlaceholder",
    ()=>GatePlaceholder,
    "LockedSection",
    ()=>LockedSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lock$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Lock$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/lock.js [app-ssr] (ecmascript) <export default as Lock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-ssr] (ecmascript)");
;
;
;
;
function LockedSection({ unlocked, placeholder, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: unlocked ? children : placeholder
    }, void 0, false);
}
function GatePlaceholder({ icon, title, description, progress, className }) {
    const pct = progress && progress.total > 0 ? Math.round(Math.min(progress.value, progress.total) / progress.total * 100) : 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("border-dashed", className),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "flex flex-col items-center gap-3 py-10 text-center",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground",
                    children: icon ?? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lock$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Lock$3e$__["Lock"], {
                        className: "h-5 w-5"
                    }, void 0, false, {
                        fileName: "[project]/src/components/locked-section.tsx",
                        lineNumber: 51,
                        columnNumber: 20
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/locked-section.tsx",
                    lineNumber: 50,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                    className: "text-base font-semibold tracking-tight text-foreground",
                    children: title
                }, void 0, false, {
                    fileName: "[project]/src/components/locked-section.tsx",
                    lineNumber: 53,
                    columnNumber: 9
                }, this),
                description && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "max-w-md text-sm leading-relaxed text-muted-foreground",
                    children: description
                }, void 0, false, {
                    fileName: "[project]/src/components/locked-section.tsx",
                    lineNumber: 57,
                    columnNumber: 11
                }, this),
                progress && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-1 flex w-full max-w-xs flex-col items-center gap-1.5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-1.5 w-full overflow-hidden rounded-full bg-muted",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-full rounded-full bg-primary transition-[width] duration-300",
                                style: {
                                    width: `${pct}%`
                                }
                            }, void 0, false, {
                                fileName: "[project]/src/components/locked-section.tsx",
                                lineNumber: 64,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/locked-section.tsx",
                            lineNumber: 63,
                            columnNumber: 13
                        }, this),
                        progress.label && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-xs tabular-nums text-muted-foreground",
                            children: progress.label
                        }, void 0, false, {
                            fileName: "[project]/src/components/locked-section.tsx",
                            lineNumber: 70,
                            columnNumber: 15
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/locked-section.tsx",
                    lineNumber: 62,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/locked-section.tsx",
            lineNumber: 49,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/locked-section.tsx",
        lineNumber: 48,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/ui/input.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Input",
    ()=>Input
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-ssr] (ecmascript)");
;
;
function Input({ className, type, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
        type: type,
        "data-slot": "input",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30", "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50", "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/input.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/src/components/add-argument-modal.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AddArgumentModal",
    ()=>AddArgumentModal,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
/**
 * Modal zum Erstellen eines neuen Arguments (PRO/CONTRA + Titel + Text).
 * Geteilt zwischen Feed-View und Taxonomy-View, damit der „+ Neues Argument"-
 * Flow überall identisch ist. Schreibt via `createArgument` (app.ch.poltr.argument.create).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/input.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$textarea$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/textarea.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/dialog.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
function AddArgumentModal({ ballotRkey, open, onOpenChange, onCreated }) {
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])("feed");
    const tc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])("common");
    const currentLocale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLocale"])();
    const [argType, setArgType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("PRO");
    const [title, setTitle] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [body, setBody] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [submitting, setSubmitting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const handleSubmit = async ()=>{
        if (!title.trim() || !body.trim() || submitting) return;
        setSubmitting(true);
        setError("");
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createArgument"])(ballotRkey, title.trim(), body.trim(), argType, [
                currentLocale
            ]);
            onCreated();
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create argument");
        } finally{
            setSubmitting(false);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Dialog"], {
        open: open,
        onOpenChange: onOpenChange,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: "sm:max-w-lg",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogTitle"], {
                        children: t("addArgument")
                    }, void 0, false, {
                        fileName: "[project]/src/components/add-argument-modal.tsx",
                        lineNumber: 61,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/add-argument-modal.tsx",
                    lineNumber: 60,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex gap-2",
                            children: [
                                "PRO",
                                "CONTRA"
                            ].map((typ)=>{
                                const selected = argType === typ;
                                const isPro = typ === "PRO";
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                    type: "button",
                                    variant: selected ? "default" : "outline",
                                    className: "flex-1",
                                    style: selected ? {
                                        backgroundColor: isPro ? "var(--pro)" : "var(--contra)",
                                        color: "#fff"
                                    } : undefined,
                                    onClick: ()=>setArgType(typ),
                                    children: isPro ? tc("pro") : tc("contra")
                                }, typ, false, {
                                    fileName: "[project]/src/components/add-argument-modal.tsx",
                                    lineNumber: 70,
                                    columnNumber: 17
                                }, this);
                            })
                        }, void 0, false, {
                            fileName: "[project]/src/components/add-argument-modal.tsx",
                            lineNumber: 65,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Input"], {
                            value: title,
                            onChange: (e)=>setTitle(e.target.value),
                            placeholder: t("titlePlaceholder")
                        }, void 0, false, {
                            fileName: "[project]/src/components/add-argument-modal.tsx",
                            lineNumber: 93,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$textarea$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Textarea"], {
                            value: body,
                            onChange: (e)=>setBody(e.target.value),
                            placeholder: t("yourArgument"),
                            rows: 5
                        }, void 0, false, {
                            fileName: "[project]/src/components/add-argument-modal.tsx",
                            lineNumber: 99,
                            columnNumber: 11
                        }, this),
                        error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-destructive text-xs",
                            children: error
                        }, void 0, false, {
                            fileName: "[project]/src/components/add-argument-modal.tsx",
                            lineNumber: 106,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/add-argument-modal.tsx",
                    lineNumber: 64,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogFooter"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                            variant: "outline",
                            onClick: ()=>onOpenChange(false),
                            children: t("cancel")
                        }, void 0, false, {
                            fileName: "[project]/src/components/add-argument-modal.tsx",
                            lineNumber: 110,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                            onClick: handleSubmit,
                            disabled: !title.trim() || !body.trim() || submitting,
                            children: submitting ? t("creating") : t("create")
                        }, void 0, false, {
                            fileName: "[project]/src/components/add-argument-modal.tsx",
                            lineNumber: 113,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/add-argument-modal.tsx",
                    lineNumber: 109,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/add-argument-modal.tsx",
            lineNumber: 59,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/add-argument-modal.tsx",
        lineNumber: 58,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = AddArgumentModal;
}),
"[project]/src/components/argumentarium-header.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ArgumentariumHeader",
    ()=>ArgumentariumHeader,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
/**
 * Header der beiden Argument-Views (booklet, taxonomy): eine ruhige Meta-Zeile
 * (Themen · Argumente · Kommentare) mit dem ViewToggle rechts daneben, plus ein
 * kurzer Einführungstext. Der Vorlagentitel steht im globalen Titelband
 * (ballot/[id]/layout.tsx) — hier bewusst kein eigener Sektionstitel mehr.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
"use client";
;
;
function ArgumentariumHeader({ ballot, // Anzahl Top-Themen — nur die Taxonomy-View liefert das; dann erscheint in der
// Meta-Zeile zusätzlich „… Themen". Booklet lässt es weg.
topicCount, // Optionaler Controls-Slot (z. B. ViewToggle) — sitzt rechts auf der
// Überschriftenzeile, gekoppelt an den Inhalt, den er umschaltet.
actions }) {
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])("argumentarium");
    const tbk = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])("booklet");
    // Ruhige Meta-Zeile statt grosser Zähler-Spalten: «5 Themen · 111 Argumente
    // · 999 Kommentare». Zahlen in Ink, Wörter muted (in einer Sakkade scanbar).
    // Themen nur, wenn die Taxonomy-View es liefert.
    const metaParts = [
        (topicCount ?? 0) > 0 ? {
            value: topicCount,
            label: tbk("topicsLabel")
        } : null,
        (ballot.argumentCount ?? 0) > 0 ? {
            value: ballot.argumentCount,
            label: tbk("argumentsLabel")
        } : null,
        // Kommentare nur ab mehr als einem (sonst „1 Kommentare" + wenig Aussage).
        (ballot.commentCount ?? 0) > 0 ? {
            value: ballot.commentCount,
            label: tbk("commentsLabel")
        } : null
    ].filter((p)=>p !== null);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-1 pt-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `flex items-center gap-4 ${metaParts.length > 0 ? "justify-between" : "justify-end"}`,
                children: [
                    metaParts.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[0.875rem] text-[var(--text-mid)]",
                        children: metaParts.map((part, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    i > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "mx-1.5",
                                        children: "·"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/argumentarium-header.tsx",
                                        lineNumber: 57,
                                        columnNumber: 27
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-semibold text-[var(--text)]",
                                        children: part.value
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/argumentarium-header.tsx",
                                        lineNumber: 58,
                                        columnNumber: 17
                                    }, this),
                                    " ",
                                    part.label
                                ]
                            }, part.label, true, {
                                fileName: "[project]/src/components/argumentarium-header.tsx",
                                lineNumber: 56,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/src/components/argumentarium-header.tsx",
                        lineNumber: 54,
                        columnNumber: 11
                    }, this),
                    actions && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "shrink-0",
                        children: actions
                    }, void 0, false, {
                        fileName: "[project]/src/components/argumentarium-header.tsx",
                        lineNumber: 66,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/argumentarium-header.tsx",
                lineNumber: 48,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "mt-4 max-w-[65ch] text-base text-[var(--text-mid)] leading-relaxed",
                children: t("intro")
            }, void 0, false, {
                fileName: "[project]/src/components/argumentarium-header.tsx",
                lineNumber: 68,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/argumentarium-header.tsx",
        lineNumber: 45,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = ArgumentariumHeader;
}),
"[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TaxonomyPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/queries/taxonomy.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$rating$2d$gate$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/queries/rating-gate.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/overlay/index.ts [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$use$2d$overlay$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay/use-overlay.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/alert.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/spinner.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$view$2d$toggle$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/view-toggle.tsx [app-ssr] (ecmascript)");
// import { PageBackdrop } from "@/components/page-backdrop";
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$position$2d$band$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/position-band.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$position$2d$cloud$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/position-cloud.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$topic$2d$panorama$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/topic-panorama.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$sunburst$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/taxonomy-sunburst.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$icicle$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/taxonomy-icicle.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$locked$2d$section$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/locked-section.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$add$2d$argument$2d$modal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/add-argument-modal.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$argumentarium$2d$header$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/argumentarium-header.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$view$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/taxonomy-view.tsx [app-ssr] (ecmascript)");
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
;
;
;
;
function TaxonomyPage() {
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useParams"])();
    const id = params.id;
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLocale"])();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])("taxonomy");
    const tc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])("common");
    const { navigate } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$use$2d$overlay$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useOverlay"])();
    const [addOpen, setAddOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const openArgument = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((rkey)=>navigate({
            type: "argument",
            rkey
        }), [
        navigate
    ]);
    // „Mehr anzeigen" eines Top-Topics → Detail-Overlay (Subtopics + alle Argumente).
    const openTopicDetail = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((topic)=>navigate({
            type: "taxonomy",
            ballotRkey: id,
            topic
        }), [
        navigate,
        id
    ]);
    // Ballot + Taxonomie aus dem zentralen Query-Cache. Eine Bewertung im Overlay
    // patcht die `["taxonomy", id, …]`-Einträge (siehe useArgumentRatingCache),
    // sodass die Karten hier ohne Refetch live aktualisieren.
    const enabled = !!id;
    const { data: ballot = null, isPending: ballotPending, error: ballotError, refetch: refetchBallot } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "ballot",
            id,
            locale
        ],
        queryFn: ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getBallot"])(id, locale),
        enabled
    });
    const { data: tax = null, isPending: taxPending, error: taxError, refetch: refetchBase } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTaxonomyBase"])(id, locale, enabled);
    const { data: fullTree = null, refetch: refetchFull } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTaxonomyFull"])(id, locale, enabled);
    // Bewertungs-Gate: die Analyse-Sektion (Sunburst + Positionsband) wird erst
    // freigeschaltet, wenn der Nutzer in jedem Top-Thema genügend bewertet hat.
    // Leitet sich live aus demselben Taxonomie-Cache ab (kein Refetch nötig).
    const gate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$rating$2d$gate$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRatingGate"])(id, locale, enabled);
    const loading = ballotPending || taxPending;
    const queryError = ballotError ?? taxError;
    const error = queryError ? queryError instanceof Error ? queryError.message : String(queryError) : null;
    const reload = ()=>{
        refetchBallot();
        refetchBase();
        refetchFull();
    };
    const root = tax?.tree;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-5 pb-[35vh]",
        children: [
            ballot && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$argumentarium$2d$header$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ArgumentariumHeader"], {
                ballot: ballot,
                topicCount: root?.children?.length,
                actions: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$view$2d$toggle$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ViewToggle"], {
                    active: "taxonomy",
                    ballotId: id
                }, void 0, false, {
                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                    lineNumber: 107,
                    columnNumber: 20
                }, void 0)
            }, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 104,
                columnNumber: 9
            }, this),
            loading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "flex items-center justify-center gap-3 py-10",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Spinner"], {}, void 0, false, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 114,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-muted-foreground",
                            children: t("loading")
                        }, void 0, false, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 115,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                    lineNumber: 113,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 112,
                columnNumber: 9
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Alert"], {
                variant: "destructive",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AlertDescription"], {
                    className: "flex items-center justify-between",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                    children: [
                                        tc("error"),
                                        ":"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                    lineNumber: 124,
                                    columnNumber: 15
                                }, this),
                                " ",
                                error
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 123,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                            variant: "destructive",
                            size: "sm",
                            onClick: reload,
                            children: tc("retry")
                        }, void 0, false, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 126,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                    lineNumber: 122,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 121,
                columnNumber: 9
            }, this),
            !loading && !error && !root && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "py-10 text-center text-muted-foreground",
                    children: t("empty")
                }, void 0, false, {
                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                    lineNumber: 135,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 134,
                columnNumber: 9
            }, this),
            !loading && root && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col gap-5",
                children: [
                    root.children.map((ch, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$view$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ThemeCard"], {
                            node: ch,
                            index: i,
                            total: root.children.length,
                            onOpen: openArgument,
                            onShowMore: ch.key ? ()=>openTopicDetail(ch.key) : undefined,
                            onAddArgument: ()=>setAddOpen(true),
                            t: t
                        }, ch.id, false, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 144,
                            columnNumber: 13
                        }, this)),
                    root.arguments.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
                        className: "border-black/5",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
                            className: "pt-6",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mb-2 text-sm font-medium text-muted-foreground",
                                    children: t("other")
                                }, void 0, false, {
                                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                    lineNumber: 158,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$view$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProContraArguments"], {
                                    args: root.arguments,
                                    onOpen: openArgument
                                }, void 0, false, {
                                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                    lineNumber: 161,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 157,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                        lineNumber: 156,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$locked$2d$section$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LockedSection"], {
                        unlocked: gate.unlocked,
                        placeholder: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$locked$2d$section$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["GatePlaceholder"], {
                            title: t("analysisLockedTitle"),
                            description: t("analysisLockedDesc"),
                            progress: {
                                value: gate.topicsMet,
                                total: gate.topicsTotal,
                                label: t("analysisLockedProgress", {
                                    met: gate.topicsMet,
                                    total: gate.topicsTotal
                                })
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 175,
                            columnNumber: 15
                        }, void 0),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                                className: "mt-6 mb-1 px-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        className: "text-lg font-semibold tracking-tight text-foreground",
                                        children: t("analysisTitle")
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                        lineNumber: 191,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-0.5 text-sm text-muted-foreground",
                                        children: t("analysisSubtitle")
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                        lineNumber: 194,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                lineNumber: 190,
                                columnNumber: 13
                            }, this),
                            fullTree?.tree && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "hidden md:block",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$sunburst$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TaxonomySunburst"], {
                                            root: fullTree.tree,
                                            t: t,
                                            onSelect: openTopicDetail
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                            lineNumber: 204,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                        lineNumber: 203,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "-mx-2 md:hidden",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$sunburst$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TaxonomySunburst"], {
                                            root: fullTree.tree,
                                            t: t,
                                            onSelect: openTopicDetail,
                                            compact: true
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                            lineNumber: 207,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                        lineNumber: 206,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$position$2d$band$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PositionBand"], {
                                nodes: root.children,
                                t: t
                            }, void 0, false, {
                                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                lineNumber: 213,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$position$2d$cloud$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PositionCloud"], {
                                nodes: root.children,
                                t: t
                            }, void 0, false, {
                                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                lineNumber: 216,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$topic$2d$panorama$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TopicPanorama"], {
                                nodes: root.children,
                                t: t
                            }, void 0, false, {
                                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                lineNumber: 219,
                                columnNumber: 13
                            }, this),
                            fullTree?.tree && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$icicle$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TaxonomyIcicle"], {
                                root: fullTree.tree,
                                t: t,
                                onSelect: openTopicDetail
                            }, void 0, false, {
                                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                lineNumber: 223,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                        lineNumber: 172,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 142,
                columnNumber: 9
            }, this),
            ballot && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$add$2d$argument$2d$modal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AddArgumentModal"], {
                ballotRkey: ballot.rkey,
                open: addOpen,
                onOpenChange: setAddOpen,
                onCreated: reload
            }, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 230,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
        lineNumber: 101,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=src_8a45d19a._.js.map