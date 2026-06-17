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
"[project]/src/lib/chart-palette.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Geteilte Farb-Palette + Haltungs→Farbe-Interpolation für die Themen-Charts
 * (Likert-Balken `diverging-likert.tsx` & Sunburst `taxonomy-sunburst.tsx`).
 *
 * EIN Satz Pole + EINE Interpolationsfunktion für beide Charts, damit „ganz
 * Nein" und „ganz Ja" überall exakt dieselbe Farbe haben: die Balken-Arme und
 * die Sunburst-Segmente teilen sich Endpunkte und Nullpunkt.
 *
 *   Koralle (Nein)  ◄──────  TRACK (neutral / Schiene)  ──────►  Navy (Ja)
 *
 * Metapher: TRACK ist die Schiene (Nullpunkt), die gefärbten Flächen sind die
 * „Füllung auf der Schiene". lean ∈ [−1,1] interpoliert linear von TRACK zum
 * jeweiligen Pol; `null` = unbewertet (kein Farbwert → Aufrufer zeigt die
 * Schienenfarbe mit gestricheltem Rand).
 */ __turbopack_context__.s([
    "ARM_NO",
    ()=>ARM_NO,
    "ARM_NO_CSS",
    ()=>ARM_NO_CSS,
    "ARM_YES",
    ()=>ARM_YES,
    "ARM_YES_CSS",
    ()=>ARM_YES_CSS,
    "TRACK",
    ()=>TRACK,
    "TRACK_CSS",
    ()=>TRACK_CSS,
    "leanRgb",
    ()=>leanRgb,
    "mixRgb",
    ()=>mixRgb,
    "rgbStr",
    ()=>rgbStr
]);
const ARM_NO = [
    202,
    112,
    88
]; // korallen / terrakotta = Nein (links)
const ARM_YES = [
    60,
    90,
    143
]; // navy = Ja (rechts)
const TRACK = [
    238,
    234,
    226
];
function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
}
function mixRgb(c1, c2, t) {
    return [
        lerp(c1[0], c2[0], t),
        lerp(c1[1], c2[1], t),
        lerp(c1[2], c2[2], t)
    ];
}
function rgbStr(c) {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
const ARM_NO_CSS = rgbStr(ARM_NO);
const ARM_YES_CSS = rgbStr(ARM_YES);
const TRACK_CSS = rgbStr(TRACK);
// Kontrast-Kurve: Beträge < 1 mit Gamma < 1 anheben, damit auch moderate
// Neigungen sichtbar Farbe zeigen (sonst landen viele Themen nahe der Schiene
// und wirken ausgewaschen). 1 = linear; kleiner = mehr Farbe pro lean-Schritt.
const LEAN_GAMMA = 0.7;
function leanRgb(lean) {
    if (lean == null) return null;
    const m = Math.pow(Math.min(1, Math.abs(lean)), LEAN_GAMMA);
    return lean >= 0 ? mixRgb(TRACK, ARM_YES, m) : mixRgb(TRACK, ARM_NO, m);
}
}),
"[project]/src/components/diverging-likert.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DivergingLikert",
    ()=>DivergingLikert,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
/**
 * Soft-OR-Balken je Thema (zwei Arme). Jede Zeile ist ein Thema: links das Label,
 * in der Mitte der Balken, rechts ein Badge.
 *
 * Der Balken hat einen festen Nullpunkt in der Mitte (neutral); von dort wachsen
 * zwei Arme in entgegengesetzte Richtungen:
 *   • korallener Arm nach LINKS  = „spricht für ein Nein" (Kontra-Argumente)
 *   • blauer Arm nach RECHTS     = „spricht für ein Ja"  (Pro-Argumente)
 *
 * Armlängen: Pro- und Kontra-Argumente liegen in zwei getrennten Töpfen (Bewertung
 * 0–100 „wie stark spricht dieses Argument dafür"). Jeder Topf wird per Soft-OR
 * (Noisy-OR mit γ, siehe lib/aggregate.ts) zu einer Zahl verdichtet: P (Ja) → blauer
 * Arm, K (Nein) → korallener Arm, beide ∈ [0,1]. Jeder Arm ist ein durchgehender
 * Balken (keine sichtbare Unterteilung); die einzelnen Argumente leben nur noch als
 * Tooltip-Segmente weiter. Eine Farbe je Seite, keine Stark/Schwach-Abstufung.
 *
 * Badge rechts = Tendenz = P − K (z. B. „+45" = lehnt um 45 Punkte Richtung Ja).
 *
 * Lesart: längerer Arm = Richtung; beide lang = umkämpft; beide kurz = indifferent;
 * lang + Stummel = klar einseitig.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/aggregate.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/chart-palette.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
const SERIF = {
    fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif'
};
// Pole + Schiene (Track) kommen aus der geteilten Palette (chart-palette.ts):
// korallen = Nein (links), navy = Ja (rechts), warmes Hellgrau = Schiene. So
// teilen Balken und Sunburst exakt dieselben Endpunkte/Nullpunkt.
// Tendenz-Badge: blau getönt Richtung Ja, korallen Richtung Nein.
const POS = {
    bg: "rgba(60, 90, 143, 0.12)",
    fg: "rgb(56, 84, 134)"
};
const NEG = {
    bg: "rgba(202, 112, 88, 0.16)",
    fg: "rgb(166, 78, 54)"
};
const ZERO = {
    bg: "rgba(0,0,0,0.05)",
    fg: "var(--muted-foreground)"
};
/* ---------- Achsen-Geometrie (viewBox-Breite 600) ---------- */ const VW = 600;
const PAD = 10;
const X0 = PAD;
const X1 = VW - PAD;
const XC = (X0 + X1) / 2; // neutrale Mitte (fester Nullpunkt)
const HALF = (X1 - X0) / 2;
const BARH = 30;
const TRACK_Y = 3;
const TRACK_H = 24;
const BAR_Y = 6;
const BAR_H = 18;
const CGAP = 3; // Lücke je Seite an der Mitte (für die Mittellinie)
const ARM_SPAN = HALF - CGAP; // px-Länge eines Arms bei Score = 1
// −/+ mit echtem Minuszeichen, z. B. „+46", „−28". v ∈ [−1,1] → Prozentpunkte.
function signed(v) {
    const n = Math.round(v * 100);
    if (n > 0) return `+${n}`;
    if (n < 0) return `−${Math.abs(n)}`;
    return "0";
}
// Ein Arm: gerundeter, durchgehender Balken ab der Mitte nach `dir` (+1 rechts /
// −1 links). EINE volle Fläche (kein Aneinanderreihen gleichfarbiger Rechtecke —
// das erzeugte feine Anti-Aliasing-Nähte an den Stossstellen). Die einzelnen
// Argumente leben nur noch als unsichtbare Hover-Flächen für die Tooltips weiter.
function renderArm(bites, dir, color, clipId) {
    const span = bites.reduce((a, b)=>a + b.bite, 0);
    if (span < 0.002) return null;
    const armLen = span * ARM_SPAN;
    const innerX = XC + dir * CGAP;
    const clipX = dir === 1 ? innerX : innerX - armLen;
    // Durchsichtige Hover-Flächen je Argument (nur für die <title>-Tooltips).
    const hits = [];
    let cum = 0;
    bites.forEach((b, i)=>{
        const a = innerX + dir * cum * ARM_SPAN;
        cum += b.bite;
        const c = innerX + dir * cum * ARM_SPAN;
        hits.push(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
            x: Math.min(a, c),
            y: BAR_Y,
            width: Math.abs(c - a),
            height: BAR_H,
            fill: "transparent",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("title", {
                children: `${Math.round(b.mag * 100)}/100`
            }, void 0, false, {
                fileName: "[project]/src/components/diverging-likert.tsx",
                lineNumber: 110,
                columnNumber: 9
            }, this)
        }, `h${i}`, false, {
            fileName: "[project]/src/components/diverging-likert.tsx",
            lineNumber: 102,
            columnNumber: 7
        }, this));
    });
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("defs", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("clipPath", {
                    id: clipId,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                        x: clipX,
                        y: BAR_Y,
                        width: armLen,
                        height: BAR_H,
                        rx: BAR_H / 2
                    }, void 0, false, {
                        fileName: "[project]/src/components/diverging-likert.tsx",
                        lineNumber: 119,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/diverging-likert.tsx",
                    lineNumber: 118,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/diverging-likert.tsx",
                lineNumber: 117,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                clipPath: `url(#${clipId})`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                        x: clipX,
                        y: BAR_Y,
                        width: armLen,
                        height: BAR_H,
                        fill: color
                    }, void 0, false, {
                        fileName: "[project]/src/components/diverging-likert.tsx",
                        lineNumber: 124,
                        columnNumber: 9
                    }, this),
                    hits
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/diverging-likert.tsx",
                lineNumber: 122,
                columnNumber: 7
            }, this)
        ]
    }, clipId, true, {
        fileName: "[project]/src/components/diverging-likert.tsx",
        lineNumber: 116,
        columnNumber: 5
    }, this);
}
function DivergingLikert({ nodes, t, onSelect }) {
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const built = nodes.map((node)=>{
            const cs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["collectLeaningContribs"])(node);
            // Zwei Töpfe: Pro (c>0) und Kontra (c<0, Betrag), je per Soft-OR verdichtet.
            const pro = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["noisyOrBites"])(cs.filter((c)=>c > 0));
            const kon = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["noisyOrBites"])(cs.filter((c)=>c < 0).map((c)=>-c));
            const P = pro.reduce((a, b)=>a + b.bite, 0);
            const K = kon.reduce((a, b)=>a + b.bite, 0);
            return {
                node,
                n: cs.length,
                P,
                K,
                tendency: P - K,
                pro,
                kon
            };
        });
        // Leaderboard: nach Tendenz (P − K); unbewertete ans Ende.
        return built.sort((a, b)=>{
            if (a.n === 0 || b.n === 0) return a.n === 0 ? b.n === 0 ? 0 : 1 : -1;
            return b.tendency - a.tendency;
        });
    }, [
        nodes
    ]);
    if (!nodes.length) return null;
    // Feste (inhaltsunabhängige) Label- und Badge-Spalten, damit die mittlere
    // 1fr-Spalte in ALLEN Zeilen exakt gleich breit/positioniert ist — sonst läge
    // die Balken-Mitte nicht unter der Mitte der Pol-Beschriftung (auto-Spalten
    // kollabieren in der Achsen-Zeile auf 0). clamp() ist responsiv, aber je
    // Zeile identisch (relativ zur Grid-Breite, nicht zum Inhalt).
    const rowGrid = "grid grid-cols-[clamp(140px,32%,230px)_1fr_3.75rem] items-center gap-4";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
        className: "border-black/5 py-6",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "px-6",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                    children: [
                        t("cloudEyebrow"),
                        " · ",
                        rows.length,
                        " ",
                        t("cloudThemes")
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/diverging-likert.tsx",
                    lineNumber: 172,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-1.5 text-[1.5rem] leading-tight tracking-tight text-foreground",
                    style: SERIF,
                    children: t("cloudTitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/diverging-likert.tsx",
                    lineNumber: 176,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-4 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground",
                    children: t("cloudSubtitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/diverging-likert.tsx",
                    lineNumber: 182,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-col gap-2",
                    children: rows.map(({ node, n, P, K, tendency, pro, kon })=>{
                        const badge = n === 0 ? ZERO : tendency > 0 ? POS : tendency < 0 ? NEG : ZERO;
                        const base = `arm-${node.id}`;
                        const clickable = !!node.key && !!onSelect;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: `${rowGrid}${clickable ? " group -mx-2 cursor-pointer rounded-lg px-2 transition hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.035] focus-visible:outline-none" : ""}`,
                            role: clickable ? "button" : undefined,
                            tabIndex: clickable ? 0 : undefined,
                            "aria-label": clickable ? node.name : undefined,
                            onClick: clickable ? ()=>onSelect(node.key) : undefined,
                            onKeyDown: clickable ? (e)=>{
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onSelect(node.key);
                                }
                            } : undefined,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: `text-right text-[15px] leading-snug text-foreground/85${clickable ? " underline-offset-2 group-hover:text-foreground group-hover:underline" : ""}`,
                                    style: SERIF,
                                    title: node.name,
                                    children: node.name
                                }, void 0, false, {
                                    fileName: "[project]/src/components/diverging-likert.tsx",
                                    lineNumber: 211,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    viewBox: `0 0 ${VW} ${BARH}`,
                                    className: "block h-auto w-full",
                                    role: "img",
                                    "aria-label": `${node.name} · für Ja ${Math.round(P * 100)} · für Nein ${Math.round(K * 100)} · ${signed(tendency)}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                            x: X0,
                                            y: TRACK_Y,
                                            width: X1 - X0,
                                            height: TRACK_H,
                                            rx: TRACK_H / 2,
                                            fill: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TRACK_CSS"],
                                            stroke: n === 0 ? "rgba(0,0,0,0.2)" : "none",
                                            strokeWidth: n === 0 ? 1 : 0,
                                            strokeDasharray: n === 0 ? "3 2.5" : undefined
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/diverging-likert.tsx",
                                            lineNumber: 228,
                                            columnNumber: 19
                                        }, this),
                                        renderArm(kon, -1, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ARM_NO_CSS"], `${base}-no`),
                                        renderArm(pro, 1, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ARM_YES_CSS"], `${base}-yes`),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: XC,
                                            y1: 2,
                                            x2: XC,
                                            y2: BARH - 2,
                                            stroke: "var(--line-mid)",
                                            strokeWidth: 1,
                                            strokeOpacity: 0.7
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/diverging-likert.tsx",
                                            lineNumber: 244,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/diverging-likert.tsx",
                                    lineNumber: 219,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "justify-self-end rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums",
                                    style: {
                                        background: badge.bg,
                                        color: badge.fg
                                    },
                                    title: n === 0 ? t("unrated") : undefined,
                                    children: n === 0 ? "—" : signed(tendency)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/diverging-likert.tsx",
                                    lineNumber: 255,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, node.id, true, {
                            fileName: "[project]/src/components/diverging-likert.tsx",
                            lineNumber: 193,
                            columnNumber: 15
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/src/components/diverging-likert.tsx",
                    lineNumber: 186,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `${rowGrid} mt-3`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                            fileName: "[project]/src/components/diverging-likert.tsx",
                            lineNumber: 269,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex text-[11px] font-semibold uppercase tracking-[0.1em]",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "flex-1 pr-2 text-right",
                                    style: {
                                        color: NEG.fg
                                    },
                                    children: [
                                        "← ",
                                        t("cloudArmNo")
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/diverging-likert.tsx",
                                    lineNumber: 271,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "flex-1 pl-2 text-left",
                                    style: {
                                        color: POS.fg
                                    },
                                    children: [
                                        t("cloudArmYes"),
                                        " →"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/diverging-likert.tsx",
                                    lineNumber: 274,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/diverging-likert.tsx",
                            lineNumber: 270,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                            fileName: "[project]/src/components/diverging-likert.tsx",
                            lineNumber: 278,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/diverging-likert.tsx",
                    lineNumber: 268,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/diverging-likert.tsx",
            lineNumber: 170,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/diverging-likert.tsx",
        lineNumber: 169,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = DivergingLikert;
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
 * Farbe = aggregierte Haltung ∈ [-1,1] des Viewers (zentrale Aggregierung, siehe
 * lib/aggregate.ts + doc/AGGREGATION.md) auf der GETEILTEN diverging-Skala aus
 * lib/chart-palette.ts — Koralle (Gegner-Seite) ↔ TRACK (neutral) ↔ Navy
 * (Befürworter-Seite), volltonig (keine Tiefen-Transparenz). Endpunkte und
 * Nullpunkt sind identisch mit den Likert-Balken-Armen. Hinter jedem Ring liegt
 * ein durchgehender Track-Ring in TRACK-Farbe (die „Schiene"); die gefärbten
 * Segmente sind die Füllung darauf. Unbewertet/ohne Login = Schienenfarbe mit
 * feinem gestricheltem Umriss (wie ein leerer Track-Abschnitt der Balken). Stark
 * gespaltene Knoten (hoher `dissent`) bekommen einen Amber-Rand — sie sind nicht
 * indifferent, sondern hin- und hergerissen.
 *
 * Segmentgröße: alle Geschwister gleich breit (Winkel des Elternsegments / Anzahl
 * Geschwister) — die Visualisierung zeigt Struktur & Haltung, nicht Volumen.
 *
 * Reines SVG, keine Chart-Library.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/aggregate.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/chart-palette.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
const SERIF = {
    fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif'
};
// −/+ mit echtem Minuszeichen, z. B. „+46", „−28". v ∈ [−1,1] → Prozentpunkte.
function signed(v) {
    const n = Math.round(v * 100);
    if (n > 0) return `+${n}`;
    if (n < 0) return `−${Math.abs(n)}`;
    return "0";
}
// dissent darüber ⇒ Knoten gilt als „gespalten" (hoher Dissens) ⇒ Amber-Rand.
const SPLIT_THRESHOLD = 0.5;
// Pole + Schiene kommen aus der geteilten Palette (chart-palette.ts), damit
// Sunburst und Likert-Balken exakt dieselben Endpunkte/Nullpunkt teilen:
//   ARM_NO (Koralle, Nein) ↔ TRACK (neutral) ↔ ARM_YES (Navy, Ja).
const AMBER = "rgb(217, 159, 40)"; // Blitz + Hinweis für stark gespaltene Knoten
// Geometrie
const SIZE = 420;
const CX = SIZE / 2;
const CY = SIZE / 2;
// Mittelloch wächst stetig mit der Ringzahl (kein Sonderfall): bei einer Ebene
// klein, damit die eine dicke Farbfläche massiv wirkt; bei drei Ebenen grösser,
// damit innen genug Bogenlänge bleibt. centerRadius() interpoliert dazwischen.
const CENTER_R_MIN = 30; // 1 Ring: kleines Loch ⇒ massivere Fläche
const CENTER_R_MAX = 30; // 3 Ringe: grösseres Loch ⇒ mehr Platz für innere Labels
const CENTER_R_COMPACT = 20; // Mobile: eigene, kleine Basis (Ring 1 bekommt mehr Platz)
const OUTER_R = 206; // äusserster Radius (Aussenkante des Track-Rings)
const TRACK_BAND = 8; // px breiter, heller Track-Streifen aussen, der die Segmente einfasst
const DATA_OUTER_R = OUTER_R - TRACK_BAND; // Aussenkante der Datenringe (Band liegt ausserhalb)
const LABEL_MIN_ANGLE = 9; // ° — schmaler ⇒ kein Label (nur Tooltip)
const LABEL_R_FRAC = 0.57; // Label-Position im Ring: >0.5 ⇒ nach aussen (mehr Bogenlänge)
const LABEL_OUTER_PAD = 12; // Compact: Abstand der äussersten Label-Zeile vom Ringrand
const CORNER_R = 4; // abgerundete Segment-Ecken
const PAD_DEG = 1.4; // ° Luft zwischen Segmenten (statt Trennlinien)
const RING_GAP = 3; // radiale Lücke zwischen den Ring-Ebenen
const MAX_LEVELS = 3; // nie mehr als 3 Ringe zeichnen (4. Ebene wird weggelassen)
const THIRD_RING_WIDTH = 16; // 3. Ring nur als dünnes Band; Ebene 1 & 2 teilen den Rest
// Mobile-Variante (`compact`): nur Ring 1 trägt Labels, also bekommt er den
// Löwenanteil des Radius — Ring 2 & 3 sind schmale Farbbänder. So sitzt Ring 1
// (und damit die Labels) bei grossem Radius mit langem Bogen ⇒ mehr Textplatz.
const SECOND_RING_COMPACT_W = 20;
const THIRD_RING_COMPACT_W = 12;
// Compact: Labels werden IMMER auf Höhe der Aussenkante des (mehrebenig) inneren
// Rings verankert — auch wenn nur eine (dicke) Ebene gezeigt wird. So sehen die
// Ring-1-Labels einebenig gleich aus wie mehrebenig (schmaler Bogen ⇒ schmaler,
// dreizeilig) statt am weiten Aussenrand breit/wenigzeilig zu werden.
const COMPACT_LABEL_OUTER_R = DATA_OUTER_R - SECOND_RING_COMPACT_W - THIRD_RING_COMPACT_W - RING_GAP / 2;
// Füllfarbe für ein Segment. Bewertet ⇒ Ton auf der geteilten Skala (leanRgb);
// unbewertet ⇒ Schienenfarbe (TRACK), sodass leere Segmente nahtlos in den
// Track-Ring darunter übergehen (markiert wird „unbewertet" allein durch den
// gestrichelten Rand, analog zu den leeren Track-Abschnitten der Balken).
function fillFor(lean) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rgbStr"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["leanRgb"])(lean) ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TRACK"]);
}
// Wahrnehmungs-Helligkeit (Rec. 601) — für Kontrast-Entscheid Label hell/dunkel.
function luminance([r, g, b]) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}
// Gestufte Legenden-Skala (diskrete Blöcke statt weichem Verlauf) — spiegelt die
// fünf Stufen der Likert-Verteilung.
const LEGEND_GRADIENT = (()=>{
    const cols = [
        -1,
        -0.7,
        -0.4,
        -0.15,
        0.15,
        0.4,
        0.7,
        1
    ].map((l)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rgbStr"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["leanRgb"])(l)));
    const n = cols.length;
    const parts = [];
    for(let i = 0; i < n; i++)parts.push(`${cols[i]} ${i / n * 100}%`, `${cols[i]} ${(i + 1) / n * 100}%`);
    return `linear-gradient(90deg, ${parts.join(", ")})`;
})();
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
// Label-Farbe kontrastabhängig: auf dunkler (satter) Füllung heller Text, auf
// heller Füllung die dunkle Variante der Segment-Hue (blau→dunkelblau, rot→
// dunkelrot, neutral→mittelgrau). Schwache Neigung mischt Richtung Grau.
function textColor(lean) {
    const c = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["leanRgb"])(lean);
    if (!c) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rgbStr"])(DARK_NEUTRAL); // unbewertet (helle Füllung)
    if (luminance(c) < 128) return "rgb(249, 249, 247)"; // dunkle Füllung → heller Text
    const strength = Math.min(1, Math.abs(lean));
    const dark = lean >= 0 ? DARK_BLUE : DARK_RED;
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rgbStr"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mixRgb"])(DARK_NEUTRAL, dark, strength));
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
// Bis `maxLevels` Ebenen — tiefere Ebenen werden gar nicht erfasst/gezeichnet
// (max. MAX_LEVELS; mit `maxLevels = 1` nur die Hauptthemen, ohne Unterthemen).
function layout(root, maxLevels = MAX_LEVELS) {
    const cap = Math.min(maxLevels, MAX_LEVELS);
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
        if (level >= cap) return; // tiefere Ebenen nicht zeichnen
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
// Radius der Zentrumsscheibe, stetig an die Ringzahl gekoppelt (kein if/else je
// Fall): 1 Ring ⇒ CENTER_R_MIN (kleines Loch, massive Fläche), MAX_LEVELS Ringe
// ⇒ CENTER_R_MAX. Compact hat seine eigene, feste Basis.
function centerRadius(levels, compact = false) {
    if (compact) return CENTER_R_COMPACT;
    const tt = MAX_LEVELS > 1 ? (Math.min(levels, MAX_LEVELS) - 1) / (MAX_LEVELS - 1) : 0;
    return Math.round(CENTER_R_MIN + (CENTER_R_MAX - CENTER_R_MIN) * tt);
}
// Ring-Grenzradien je Ebenenzahl. Bei 3 Ebenen bekommt der äusserste Ring nur
// THIRD_RING_WIDTH (dünnes Band); Ebene 1 & 2 teilen den verbleibenden Platz.
// `centerR` = Innenradius des innersten Rings (aus centerRadius()). Die Datenringe
// reichen bis DATA_OUTER_R; der Track-Streifen (TRACK_BAND) liegt ausserhalb davon.
// Rückgabe: radii[level-1]..radii[level] = [Innen, Aussen] des Rings `level`.
function ringRadii(levels, centerR, compact = false) {
    if (levels <= 1) return [
        centerR,
        DATA_OUTER_R
    ];
    if (compact) {
        // Mobile: nur Ring 1 beschriftet ⇒ ihm den Grossteil des Platzes geben
        // (kleineres Mittelloch); Ring 2 & 3 sind reine Bänder (Ring 2 etwas länger).
        if (levels === 2) return [
            centerR,
            DATA_OUTER_R - SECOND_RING_COMPACT_W,
            DATA_OUTER_R
        ];
        const inner3 = DATA_OUTER_R - THIRD_RING_COMPACT_W;
        const inner2 = inner3 - SECOND_RING_COMPACT_W;
        return [
            centerR,
            inner2,
            inner3,
            DATA_OUTER_R
        ];
    }
    if (levels === 2) {
        const step = (DATA_OUTER_R - centerR) / 2;
        return [
            centerR,
            centerR + step,
            DATA_OUTER_R
        ];
    }
    const inner = DATA_OUTER_R - THIRD_RING_WIDTH; // Beginn des dünnen 3. Rings
    const step = (inner - centerR) / 2;
    return [
        centerR,
        centerR + step,
        inner,
        DATA_OUTER_R
    ];
}
function TaxonomySunburst({ root, t, onSelect, compact = false }) {
    const [hover, setHover] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    // Unterthemen (Ebene 2+) standardmässig ausgeblendet; per Checkbox einblendbar.
    const [showSub, setShowSub] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    // Gibt es überhaupt Unterthemen? Sonst ist die Checkbox sinnlos.
    const hasSub = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(root.children ?? []).some((c)=>(c.children?.length ?? 0) > 0), [
        root
    ]);
    const { segs, radii, maxLevel, centerR } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const { segs, maxLevel } = layout(root, showSub ? MAX_LEVELS : 1);
        const centerR = centerRadius(maxLevel, compact);
        const radii = ringRadii(maxLevel, centerR, compact);
        return {
            segs,
            radii,
            maxLevel,
            centerR
        };
    }, [
        root,
        compact,
        showSub
    ]);
    // Aggregierte Haltung je Knoten — zentrale Funktion (Schalter in lib/aggregate.ts).
    // Live-Update: `root` wechselt die Referenz bei jeder Bewertung ⇒ Neuberechnung.
    const leanMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const m = new Map();
        const walk = (n)=>{
            m.set(n.id, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["nodeLeaning"])(n));
            for (const c of n.children ?? [])walk(c);
        };
        walk(root);
        return m;
    }, [
        root
    ]);
    const leanOf = (n)=>leanMap.get(n.id) ?? null;
    if (!segs.length) return null;
    // Chart-Breite: einebenig/compact kompakt, mehrebenig grösser.
    const chartMaxW = maxLevel <= 1 ? 440 : 680;
    // Labels sollen physisch (in CSS-Pixeln) gleich gross sein, egal ob ein- oder
    // mehrebenig. Da die viewBox fix SIZE breit ist, der Chart aber je nach Modus
    // unterschiedlich breit dargestellt wird (chartMaxW), skaliert jede SVG-Einheit
    // mit chartMaxW/SIZE. Wir halten Schriftgrösse × Breite konstant (REF_FONT bei
    // REF_WIDTH = Ring-1-Labels im mehrebenigen Chart) ⇒ gleiche gerenderte Grösse.
    const REF_FONT = 10;
    const REF_WIDTH = 680;
    const labelFont = compact ? 13 : REF_FONT * REF_WIDTH / chartMaxW;
    // Standardmässig kein Panel; nur beim Hover erscheint Titel + Bewertung seitlich.
    const active = hover;
    const lean = active ? leanOf(active) : null;
    // Hover zeigt Thema + aggregierte Haltung (in Prozentpunkten); unbewertet:
    // Hinweistext.
    const ratingLabel = active ? lean == null ? t("sunburstLeanUnrated") : `⌀ ${signed(lean)}` : "";
    // Farbe = Seite (blau/rot), abgedunkelt für Lesbarkeit.
    const ratingColor = lean == null ? "rgba(0,0,0,0.5)" : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rgbStr"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mixRgb"])(lean >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ARM_YES"] : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ARM_NO"], [
        30,
        30,
        30
    ], 0.1));
    // Gespalten (hoher dissent) ⇒ Amber-Hinweis im Panel, passend zum Amber-Rand.
    const activeSplit = !!active && (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["nodeDissent"])(active) > SPLIT_THRESHOLD;
    // Panel auf die dem Segment gegenüberliegende Seite legen (Winkel 0–180 = rechte
    // Hälfte → Panel links, sonst rechts), damit es das aktive Segment nicht verdeckt.
    const activeSeg = active ? segs.find((s)=>s.node === active) : undefined;
    const activeMid = activeSeg ? (activeSeg.a0 + activeSeg.a1) / 2 : 0;
    const panelSide = activeMid > 0 && activeMid < 180 ? "left" : "right";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
        className: "border-black/5 py-6",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "px-6",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                    children: t("sunburstEyebrow")
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 414,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mb-1.5 flex items-start justify-between gap-3",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-[1.5rem] leading-tight tracking-tight text-foreground",
                            style: SERIF,
                            children: t("sunburstTitle")
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 418,
                            columnNumber: 11
                        }, this),
                        hasSub && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            className: "flex shrink-0 cursor-pointer items-center gap-1.5 text-[12.5px] text-muted-foreground select-none",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    type: "checkbox",
                                    className: "h-3.5 w-3.5 cursor-pointer accent-current",
                                    checked: showSub,
                                    onChange: (e)=>setShowSub(e.target.checked)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 426,
                                    columnNumber: 15
                                }, this),
                                t("sunburstSubtopics")
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 425,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 417,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-3 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground",
                    children: t("sunburstSubtitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 436,
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
                                Array.from({
                                    length: maxLevel
                                }, (_, i)=>i + 1).map((level)=>{
                                    const rInner = radii[level - 1] + RING_GAP / 2;
                                    // Äusserste Ebene: Track bis ganz an OUTER_R (Einfassungs-Streifen).
                                    const rOuter = level === maxLevel ? OUTER_R : radii[level] - RING_GAP / 2;
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                        cx: CX,
                                        cy: CY,
                                        r: (rInner + rOuter) / 2,
                                        fill: "none",
                                        stroke: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TRACK_CSS"],
                                        strokeWidth: rOuter - rInner
                                    }, `track-${level}`, false, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 463,
                                        columnNumber: 17
                                    }, this);
                                }),
                                segs.map((s)=>{
                                    // Radiale Lücke zwischen den Ebenen: jedes Band beidseitig einrücken.
                                    // Datenringe enden bei DATA_OUTER_R; der Track-Streifen liegt ausserhalb.
                                    const rInner = radii[s.level - 1] + RING_GAP / 2;
                                    const rOuter = radii[s.level] - RING_GAP / 2;
                                    const thickness = rOuter - rInner; // Ringdicke (3. Ring ist dünn)
                                    const span = s.a1 - s.a0;
                                    // Luft zwischen Segmenten: Winkel beidseitig einschrumpfen
                                    // (höchstens ~⅓ der Breite, damit schmale Segmente bestehen bleiben).
                                    const pad = Math.min(PAD_DEG, span * 0.35) / 2;
                                    const pa0 = s.a0 + pad;
                                    const pa1 = s.a1 - pad;
                                    const lean = leanOf(s.node);
                                    const unrated = lean == null; // Schienenfarbe ⇒ gestrichelter Umriss
                                    // Gespalten = hoher Dissens (Ja- UND Nein-Argumente stark bewertet) ⇒ Amber-Rand.
                                    const split = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["nodeDissent"])(s.node) > SPLIT_THRESHOLD;
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
                                    // Compact-Ring 1 trägt das einzige Label. Block am Aussenrand verankert;
                                    // höchstens 3 Zeilen, damit er nicht zu weit Richtung Mitte (kurze
                                    // Bögen) reicht — der lange Bogen weit aussen gibt genug Breite.
                                    const maxLines = curved ? compact ? 3 : thickness >= 30 ? 3 : 2 : thickness >= 28 ? 2 : 1;
                                    // Compact: Labels auf Höhe des (mehrebenig) inneren Rings verankern,
                                    // damit sie einebenig gleich aussehen (schmal, dreizeilig) statt am
                                    // weiten Aussenrand des dicken Rings zu kleben. Mehrebenig ist rOuter
                                    // ohnehin ≈ COMPACT_LABEL_OUTER_R ⇒ unverändert.
                                    const labelOuterR = compact ? Math.min(rOuter, COMPACT_LABEL_OUTER_R) : rOuter;
                                    // Zeichenkapazität an der INNERSTEN möglichen Zeile bemessen (kleinster
                                    // Radius = kürzester Bogen). Compact: worst case = maxLines, am
                                    // Aussenrand verankert — so überläuft auch ein voller Block nie.
                                    const charR = curved ? compact ? labelOuterR - LABEL_OUTER_PAD - (maxLines - 1) * lineGap : rInner + (rOuter - rInner) * LABEL_R_FRAC - (maxLines - 1) / 2 * lineGap : 0;
                                    const maxChars = curved ? Math.max(3, Math.floor(span / 360 * 2 * Math.PI * charR / (6.5 * segScale))) : Math.max(4, Math.floor((rOuter - labelInnerR - 6) / (5.8 * segScale)));
                                    // Compact: lange Einzelwörter mit Bindestrich umbrechen statt mit „…".
                                    const lines = wrapLabel(s.node.name, maxChars, maxLines, curved && compact);
                                    // Label-Radius aus der TATSÄCHLICHEN Zeilenzahl. Compact: oberste Zeile
                                    // ans Aussenrand-Limit (rOuter − Pad) verankern, Block füllt nach innen
                                    // ⇒ auch kurze Labels sitzen aussen statt mittig zu schweben. Desktop:
                                    // Fraktion wie gehabt.
                                    const labelR = !curved ? (labelInnerR + rOuter) / 2 : compact ? labelOuterR - LABEL_OUTER_PAD - (lines.length - 1) / 2 * lineGap : rInner + (rOuter - rInner) * LABEL_R_FRAC;
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
                                                fill: fillFor(lean),
                                                // Bewertet ⇒ heller Kartenrand (wie die Balken-Separatoren,
                                                // strokeWidth 1.5) für eine saubere Kante gegen Nachbar & Schiene
                                                // — radial vom Innenloch bis zum Track-Ring; unbewertet ⇒
                                                // gestrichelter, „provisorischer" Rand.
                                                stroke: unrated ? "rgba(0,0,0,0.2)" : "var(--card)",
                                                strokeWidth: unrated ? 1 : 1.5,
                                                strokeDasharray: unrated ? "3 2.5" : undefined,
                                                style: {
                                                    cursor: clickable ? "pointer" : "default",
                                                    // Volltonig (keine Tiefen-Transparenz) — die Aussage steckt
                                                    // allein in der Mischfarbe, exakt wie bei den Balken.
                                                    opacity: hover && hover !== s.node ? 0.82 : 1,
                                                    transition: "opacity 120ms"
                                                },
                                                onMouseEnter: ()=>setHover(s.node),
                                                onMouseLeave: ()=>setHover((h)=>h === s.node ? null : h),
                                                onClick: ()=>clickable && onSelect(s.node.key)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                lineNumber: 574,
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
                                                    opacity: hover && hover !== s.node ? 0.82 : 1
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                    lineNumber: 603,
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
                                                            lineNumber: 623,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                                            fill: textColor(lean),
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
                                                                lineNumber: 636,
                                                                columnNumber: 29
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                            lineNumber: 628,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, pid, true, {
                                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                    lineNumber: 622,
                                                    columnNumber: 25
                                                }, this);
                                            }),
                                            showLabel && !curved && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                                x: lx,
                                                y: ly,
                                                fill: textColor(lean),
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
                                                        lineNumber: 659,
                                                        columnNumber: 25
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                lineNumber: 648,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, `${s.node.id}-${s.level}`, true, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 573,
                                        columnNumber: 17
                                    }, this);
                                }),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                    cx: CX,
                                    cy: CY,
                                    r: centerR,
                                    fill: "var(--card)",
                                    stroke: "rgba(0,0,0,0.05)"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 679,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 444,
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
                                        lineNumber: 697,
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
                                        lineNumber: 700,
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
                                                    lineNumber: 716,
                                                    columnNumber: 23
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                lineNumber: 711,
                                                columnNumber: 21
                                            }, this),
                                            t("sunburstDissentNote")
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 707,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                lineNumber: 696,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 692,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 440,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-5 border-t border-black/5 pt-4 flex items-center justify-center gap-3 text-[13px] font-medium",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                color: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rgbStr"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ARM_NO"])
                            },
                            children: t("poleOpponents")
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 731,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "h-2.5 w-44 rounded-full",
                            style: {
                                background: LEGEND_GRADIENT
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 732,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                color: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rgbStr"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ARM_YES"])
                            },
                            children: t("poleSupporters")
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 736,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 730,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground",
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
                                        lineNumber: 748,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 743,
                                    columnNumber: 13
                                }, this),
                                t("sunburstLeanUnrated")
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 742,
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
                                        lineNumber: 765,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 760,
                                    columnNumber: 13
                                }, this),
                                t("sunburstDissentNote")
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 759,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 741,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
            lineNumber: 413,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
        lineNumber: 412,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = TaxonomySunburst;
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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$diverging$2d$likert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/diverging-likert.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$sunburst$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/taxonomy-sunburst.tsx [app-ssr] (ecmascript)");
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
                    lineNumber: 104,
                    columnNumber: 20
                }, void 0)
            }, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 101,
                columnNumber: 9
            }, this),
            loading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "flex items-center justify-center gap-3 py-10",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Spinner"], {}, void 0, false, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 111,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-muted-foreground",
                            children: t("loading")
                        }, void 0, false, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 112,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                    lineNumber: 110,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 109,
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
                                    lineNumber: 121,
                                    columnNumber: 15
                                }, this),
                                " ",
                                error
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 120,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                            variant: "destructive",
                            size: "sm",
                            onClick: reload,
                            children: tc("retry")
                        }, void 0, false, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 123,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                    lineNumber: 119,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 118,
                columnNumber: 9
            }, this),
            !loading && !error && !root && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "py-10 text-center text-muted-foreground",
                    children: t("empty")
                }, void 0, false, {
                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                    lineNumber: 132,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 131,
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
                            lineNumber: 141,
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
                                    lineNumber: 155,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$view$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProContraArguments"], {
                                    args: root.arguments,
                                    onOpen: openArgument
                                }, void 0, false, {
                                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                    lineNumber: 158,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 154,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                        lineNumber: 153,
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
                            lineNumber: 172,
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
                                        lineNumber: 188,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-0.5 text-sm text-muted-foreground",
                                        children: t("analysisSubtitle")
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                        lineNumber: 191,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                lineNumber: 187,
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
                                            lineNumber: 201,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                        lineNumber: 200,
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
                                            lineNumber: 204,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                        lineNumber: 203,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$diverging$2d$likert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DivergingLikert"], {
                                nodes: root.children,
                                t: t,
                                onSelect: openTopicDetail
                            }, void 0, false, {
                                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                lineNumber: 210,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                        lineNumber: 169,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 139,
                columnNumber: 9
            }, this),
            ballot && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$add$2d$argument$2d$modal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AddArgumentModal"], {
                ballotRkey: ballot.rkey,
                open: addOpen,
                onOpenChange: setAddOpen,
                onCreated: reload
            }, void 0, false, {
                fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                lineNumber: 216,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
        lineNumber: 98,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=src_6e89344d._.js.map