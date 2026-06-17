(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/queries/rating-gate.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "computeRatingGate",
    ()=>computeRatingGate,
    "useRatingGate",
    ()=>useRatingGate
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/queries/taxonomy.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
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
    _s();
    const { data } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTaxonomyBase"])(ballotId, locale, enabled);
    return computeRatingGate(data?.tree.children ?? []);
}
_s(useRatingGate, "M00PHffCpHSF9bCV02PIKLTLHM0=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTaxonomyBase"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/view-toggle.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$list$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__List$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/list.js [app-client] (ecmascript) <export default as List>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/book-open.js [app-client] (ecmascript) <export default as BookOpen>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$network$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Network$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/network.js [app-client] (ecmascript) <export default as Network>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
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
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const raw = window.localStorage.getItem(ARGUMENTS_VIEW_STORAGE_KEY);
    return ARGUMENTS_VIEWS.includes(raw ?? "") ? raw : DEFAULT_ARGUMENTS_VIEW;
}
function persistArgumentsView(view) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    window.localStorage.setItem(ARGUMENTS_VIEW_STORAGE_KEY, view);
}
const viewDefs = [
    {
        key: "taxonomy",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$network$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Network$3e$__["Network"],
        labelKey: "taxonomy",
        segment: "taxonomy"
    },
    {
        key: "booklet",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__["BookOpen"],
        labelKey: "booklet",
        segment: "booklet"
    },
    {
        key: "feed",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$list$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__List$3e$__["List"],
        labelKey: "feed",
        segment: "feed"
    }
];
function ViewToggle({ active, ballotId }) {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("viewToggle");
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ViewToggle.useEffect": ()=>{
            persistArgumentsView(active);
        }
    }["ViewToggle.useEffect"], [
        active
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center gap-1.5 shrink-0",
        children: viewDefs.map(({ key, icon: Icon, labelKey, segment })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                title: t(labelKey),
                onClick: ()=>{
                    if (key === active) return;
                    persistArgumentsView(key);
                    router.push(`/ballot/${ballotId}/arguments/${segment}`);
                },
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex items-center justify-center size-[30px] rounded-[var(--r-sm)] border transition-all duration-150 cursor-pointer", key === active ? "border-[var(--line-mid)] bg-accent text-[var(--text)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-mid)] hover:bg-accent hover:border-[var(--line-mid)]"),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
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
_s(ViewToggle, "UBcZvPQlDgnslx0gI0CWWsXZgRE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = ViewToggle;
var _c;
__turbopack_context__.k.register(_c, "ViewToggle");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/chart-palette.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
_c = ARM_NO_CSS;
const ARM_YES_CSS = rgbStr(ARM_YES);
_c1 = ARM_YES_CSS;
const TRACK_CSS = rgbStr(TRACK);
_c2 = TRACK_CSS;
// Kontrast-Kurve: Beträge < 1 mit Gamma < 1 anheben, damit auch moderate
// Neigungen sichtbar Farbe zeigen (sonst landen viele Themen nahe der Schiene
// und wirken ausgewaschen). 1 = linear; kleiner = mehr Farbe pro lean-Schritt.
const LEAN_GAMMA = 0.7;
function leanRgb(lean) {
    if (lean == null) return null;
    const m = Math.pow(Math.min(1, Math.abs(lean)), LEAN_GAMMA);
    return lean >= 0 ? mixRgb(TRACK, ARM_YES, m) : mixRgb(TRACK, ARM_NO, m);
}
var _c, _c1, _c2;
__turbopack_context__.k.register(_c, "ARM_NO_CSS");
__turbopack_context__.k.register(_c1, "ARM_YES_CSS");
__turbopack_context__.k.register(_c2, "TRACK_CSS");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/diverging-likert.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DivergingLikert",
    ()=>DivergingLikert,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
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
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/aggregate.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/chart-palette.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
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
        hits.push(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
            x: Math.min(a, c),
            y: BAR_Y,
            width: Math.abs(c - a),
            height: BAR_H,
            fill: "transparent",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("title", {
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("defs", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("clipPath", {
                    id: clipId,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                clipPath: `url(#${clipId})`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
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
    _s();
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DivergingLikert.useMemo[rows]": ()=>{
            const built = nodes.map({
                "DivergingLikert.useMemo[rows].built": (node)=>{
                    const cs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["collectLeaningContribs"])(node);
                    // Zwei Töpfe: Pro (c>0) und Kontra (c<0, Betrag), je per Soft-OR verdichtet.
                    const pro = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noisyOrBites"])(cs.filter({
                        "DivergingLikert.useMemo[rows].built.pro": (c)=>c > 0
                    }["DivergingLikert.useMemo[rows].built.pro"]));
                    const kon = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["noisyOrBites"])(cs.filter({
                        "DivergingLikert.useMemo[rows].built.kon": (c)=>c < 0
                    }["DivergingLikert.useMemo[rows].built.kon"]).map({
                        "DivergingLikert.useMemo[rows].built.kon": (c)=>-c
                    }["DivergingLikert.useMemo[rows].built.kon"]));
                    const P = pro.reduce({
                        "DivergingLikert.useMemo[rows].built.P": (a, b)=>a + b.bite
                    }["DivergingLikert.useMemo[rows].built.P"], 0);
                    const K = kon.reduce({
                        "DivergingLikert.useMemo[rows].built.K": (a, b)=>a + b.bite
                    }["DivergingLikert.useMemo[rows].built.K"], 0);
                    return {
                        node,
                        n: cs.length,
                        P,
                        K,
                        tendency: P - K,
                        pro,
                        kon
                    };
                }
            }["DivergingLikert.useMemo[rows].built"]);
            // Leaderboard: nach Tendenz (P − K); unbewertete ans Ende.
            return built.sort({
                "DivergingLikert.useMemo[rows]": (a, b)=>{
                    if (a.n === 0 || b.n === 0) return a.n === 0 ? b.n === 0 ? 0 : 1 : -1;
                    return b.tendency - a.tendency;
                }
            }["DivergingLikert.useMemo[rows]"]);
        }
    }["DivergingLikert.useMemo[rows]"], [
        nodes
    ]);
    if (!nodes.length) return null;
    // Feste (inhaltsunabhängige) Label- und Badge-Spalten, damit die mittlere
    // 1fr-Spalte in ALLEN Zeilen exakt gleich breit/positioniert ist — sonst läge
    // die Balken-Mitte nicht unter der Mitte der Pol-Beschriftung (auto-Spalten
    // kollabieren in der Achsen-Zeile auf 0). clamp() ist responsiv, aber je
    // Zeile identisch (relativ zur Grid-Breite, nicht zum Inhalt).
    const rowGrid = "grid grid-cols-[clamp(140px,32%,230px)_1fr_3.75rem] items-center gap-4";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
        className: "border-black/5 py-6",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "px-6",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-1.5 text-[1.5rem] leading-tight tracking-tight text-foreground",
                    style: SERIF,
                    children: t("cloudTitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/diverging-likert.tsx",
                    lineNumber: 176,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-4 text-[13.5px] leading-relaxed text-muted-foreground",
                    children: t("cloudSubtitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/diverging-likert.tsx",
                    lineNumber: 182,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-col gap-2",
                    children: rows.map(({ node, n, P, K, tendency, pro, kon })=>{
                        const badge = n === 0 ? ZERO : tendency > 0 ? POS : tendency < 0 ? NEG : ZERO;
                        const base = `arm-${node.id}`;
                        const clickable = !!node.key && !!onSelect;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: `text-right text-[15px] leading-snug text-foreground/85${clickable ? " underline-offset-2 group-hover:text-foreground group-hover:underline" : ""}`,
                                    style: SERIF,
                                    title: node.name,
                                    children: node.name
                                }, void 0, false, {
                                    fileName: "[project]/src/components/diverging-likert.tsx",
                                    lineNumber: 211,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    viewBox: `0 0 ${VW} ${BARH}`,
                                    className: "block h-auto w-full",
                                    role: "img",
                                    "aria-label": `${node.name} · für Ja ${Math.round(P * 100)} · für Nein ${Math.round(K * 100)} · ${signed(tendency)}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                            x: X0,
                                            y: TRACK_Y,
                                            width: X1 - X0,
                                            height: TRACK_H,
                                            rx: TRACK_H / 2,
                                            fill: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TRACK_CSS"],
                                            stroke: n === 0 ? "rgba(0,0,0,0.2)" : "none",
                                            strokeWidth: n === 0 ? 1 : 0,
                                            strokeDasharray: n === 0 ? "3 2.5" : undefined
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/diverging-likert.tsx",
                                            lineNumber: 228,
                                            columnNumber: 19
                                        }, this),
                                        renderArm(kon, -1, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ARM_NO_CSS"], `${base}-no`),
                                        renderArm(pro, 1, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ARM_YES_CSS"], `${base}-yes`),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `${rowGrid} mt-3`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                            fileName: "[project]/src/components/diverging-likert.tsx",
                            lineNumber: 269,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex text-[11px] font-semibold uppercase tracking-[0.1em]",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
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
_s(DivergingLikert, "LHVMCglWcQeRoCgUufL/A5uf67g=");
_c = DivergingLikert;
const __TURBOPACK__default__export__ = DivergingLikert;
var _c;
__turbopack_context__.k.register(_c, "DivergingLikert");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/taxonomy-sunburst.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TaxonomySunburst",
    ()=>TaxonomySunburst,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Taxonomie-Sunburst — die Themen-Hierarchie als konzentrische Ringe (Zentrum =
 * Ballot, Ring 1 = Hauptthemen, weitere Ringe = Subthemen). Ergänzt das
 * Positionsband um die ganze Tiefe der Hierarchie auf einen Blick.
 *
 * Farbe = aggregierte Haltung ∈ [-1,1] des Viewers (zentrale Aggregierung, siehe
 * lib/aggregate.ts + doc/AGGREGATION.md) auf der GETEILTEN diverging-Skala aus
 * lib/chart-palette.ts — Koralle (Gegner-Seite) ↔ TRACK (neutral) ↔ Navy
 * (Befürworter-Seite), volltonig (keine Tiefen-Transparenz; Unterthemen sind so
 * kräftig wie die Oberthemen). Endpunkte und Nullpunkt sind identisch mit den
 * Likert-Balken-Armen. Kein Track-Ring: die Hierarchie tragen die hellen
 * var(--card)-Separatoren zwischen den Segmenten plus die radialen RING_GAP-Lücken
 * zwischen den Ebenen. Unbewertet/ohne Login = transparentes Segment mit feinem
 * gestricheltem Umriss (wie ein leerer Track-Abschnitt der Balken). Stark
 * gespaltene Knoten (hoher `dissent`) bekommen einen Amber-Rand — sie sind nicht
 * indifferent, sondern hin- und hergerissen.
 *
 * Layout (Drei-Block): Die Oberthemen (Ring 1) werden nach aggregierter Haltung in
 * drei Blöcke gruppiert — Nein (links), Neutral (oben), Ja (rechts) — getrennt
 * durch breite Inter-Block-Lücken (BLOCK_GAP_DEG). Das spiegelt die Nein←→Ja-Achse
 * der Likert-Balken. Alle Themen sind gleich breit (Argument-Volumen spielt keine
 * Rolle); ein Block ist so breit wie seine Anzahl Themen. Unterthemen erben den
 * Winkelbereich (und damit den Block) ihres Elternteils, behalten aber ihre eigene
 * Haltungsfarbe (interner Dissens bleibt sichtbar). Nach der Verteilung wird das
 * Rad rotiert, damit die Achse stabil bleibt (Naht Nein↔Ja unten, Neutral oben) —
 * unabhängig von den Blockgrössen.
 *
 * Reines SVG, keine Chart-Library.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/aggregate.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/chart-palette.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
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
const CENTER_R_MIN = 18; // 1 Ring: kleines Loch ⇒ massivere Fläche
const CENTER_R_MAX = 38; // 3 Ringe: grösseres Loch ⇒ mehr Platz für innere Labels
const CENTER_R_COMPACT = 20; // Mobile: eigene, kleine Basis (Ring 1 bekommt mehr Platz)
const OUTER_R = 206; // äusserster Radius (Aussenkante des Track-Rings)
// Aussen-Rand der viewBox für die Block-Labels. Seitlich mehr (breite Labels wie
// „Nein-Themen"), oben/unten weniger (nur „Ausgewogen") ⇒ wenig vertikaler Leerraum.
const VIEW_PAD_X = 96;
const VIEW_PAD_Y = 28;
const BLOCK_LABEL_R = OUTER_R + 8; // Radius der Block-Labels (knapp ausserhalb des Rings)
const BLOCK_LABEL_FONT = 9; // SVG-Einheiten (skaliert mit dem Rad)
const DATA_OUTER_R = OUTER_R; // Aussenkante der Datenringe (kein Track-Band mehr)
const LABEL_MIN_ANGLE = 9; // ° — schmaler ⇒ kein Label (nur Tooltip)
const LABEL_R_FRAC = 0.57; // Label-Position im Ring: >0.5 ⇒ nach aussen (mehr Bogenlänge)
const LABEL_OUTER_PAD = 12; // Compact: Abstand der äussersten Label-Zeile vom Ringrand
const CORNER_R = 4; // abgerundete Segment-Ecken
const PAD_DEG = 1.4; // ° Intra-Block-Luft zwischen Segmenten desselben Blocks
// Breite Inter-Block-Lücke zwischen befüllten Blöcken (≫ PAD_DEG). Leere Blöcke
// kollabieren auf 0° ⇒ ihre angrenzenden Lücken verschmelzen automatisch.
const BLOCK_GAP_DEG = 10;
// Multi-Level: die Spannungslücke unten (Naht Ja↔Nein) ein Tick breiter als die
// übrigen Block-Lücken, damit die Pol-Trennung über alle Ringe klar bleibt. Im
// Single-Level bleibt die Naht bei BLOCK_GAP_DEG ⇒ aufgeräumt & konsistent.
const SEAM_GAP_EXTRA = 4;
// Neutral-Band in Prozentpunkten (identisch zur Skala der Balken-Badges, lean×100):
// |lean·100| ≤ NEUTRAL_BAND ⇒ Neutral-Block; darunter Nein, darüber Ja.
const NEUTRAL_BAND = 20;
const RING_GAP = 4; // radiale Lücke zwischen den Ring-Ebenen (trägt mit den Separatoren die Hierarchie statt eines Track-Rings)
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
// Füllfarbe für ein bewertetes Segment: Ton auf der geteilten Skala (leanRgb).
// Unbewertete Segmente füllt der Aufrufer transparent (kein Track mehr); TRACK
// bleibt nur Fallback, falls leanRgb ausnahmsweise null liefert.
function fillFor(lean) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rgbStr"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["leanRgb"])(lean) ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TRACK"]);
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
    ].map((l)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rgbStr"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["leanRgb"])(l)));
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
    const c = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["leanRgb"])(lean);
    if (!c) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rgbStr"])(DARK_NEUTRAL); // unbewertet (helle Füllung)
    if (luminance(c) < 128) return "rgb(249, 249, 247)"; // dunkle Füllung → heller Text
    const strength = Math.min(1, Math.abs(lean));
    const dark = lean >= 0 ? DARK_BLUE : DARK_RED;
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rgbStr"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["mixRgb"])(DARK_NEUTRAL, dark, strength));
}
// Block-Beschriftung aussen am Rad: Pol-Farben für Ja/Nein, neutrales Grau für
// „Ausgewogen". Translation-Keys aus den Messages.
const BLOCK_LABEL = {
    no: {
        key: "sunburstBlockNo",
        color: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rgbStr"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ARM_NO"])
    },
    neutral: {
        key: "sunburstBlockNeutral",
        color: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rgbStr"])(DARK_NEUTRAL)
    },
    yes: {
        key: "sunburstBlockYes",
        color: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rgbStr"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ARM_YES"])
    }
};
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
// Block-Zuordnung aus dem aggregierten lean (∈[−1,1]); unbewertet ⇒ eigener Status.
function blockOf(lean) {
    if (lean == null) return "unrated";
    const pct = lean * 100;
    if (pct < -NEUTRAL_BAND) return "no";
    if (pct > NEUTRAL_BAND) return "yes";
    return "neutral";
}
// Alle Themen sind gleich breit — das Argument-Volumen spielt bewusst KEINE Rolle.
// Jeder Knoten zählt gleich (Gewicht 1): Geschwister teilen ihren Bereich zu
// gleichen Teilen, ein Block ist so breit wie seine Anzahl Themen. Einzige Stelle,
// um wieder auf eine volumen-/bewertungsabhängige Gewichtung umzustellen.
function nodeWeight(_node) {
    return 1;
}
// Drei-Block-Layout: Ring-1-Knoten nach Block (Nein/Neutral/Ja/Unbewertet)
// gruppieren und zu gleichen Teilen (gleich breit) auf den Kreis verteilen;
// Unterthemen rekursiv gleich breit INNERHALB der Eltern-Grenzen (sie erben so den
// Block). Anschliessend wird das Rad rotiert, damit die Achse stabil bleibt: die
// Naht zwischen Ja- und Nein-Block (durch die Unbewertet-Zone) liegt immer unten
// (180°), Neutral oben — unabhängig von den Blockgrössen.
// Bis `maxLevels` Ebenen (max. MAX_LEVELS; `maxLevels = 1` ⇒ nur Hauptthemen).
function layout(root, maxLevels, leanOf) {
    const cap = Math.min(maxLevels, MAX_LEVELS);
    const segs = [];
    let maxLevel = 0;
    // Einen Knoten samt Teilbaum zu gleichen Teilen (Gewicht je Knoten = 1) in [a0,a1].
    const place = (node, level, a0, a1)=>{
        segs.push({
            node,
            level,
            a0,
            a1
        });
        if (level > maxLevel) maxLevel = level;
        if (level >= cap) return; // tiefere Ebenen nicht zeichnen
        const kids = node.children ?? [];
        if (!kids.length) return;
        const tw = kids.reduce((s, k)=>s + nodeWeight(k), 0) || 1;
        let cur = a0;
        for (const k of kids){
            const w = (a1 - a0) * nodeWeight(k) / tw;
            place(k, level + 1, cur, cur + w);
            cur += w;
        }
    };
    // Ring-1-Knoten in Blöcke einsortieren, je Block AUFSTEIGEND nach signiertem lean.
    // In Uhrzeiger-Reihenfolge (Neutral → Ja → Unbewertet → Nein) ergibt das einen
    // durchgehenden Verlauf: das stärkste Nein und das stärkste Ja stossen unten an
    // der Naht zwischen den Polen aneinander (jeweils stärkste Tendenz an der Naht),
    // schwächere wandern Richtung Neutral oben.
    const groups = {
        no: [],
        neutral: [],
        yes: [],
        unrated: []
    };
    for (const n of root.children ?? [])groups[blockOf(leanOf(n))].push(n);
    for (const b of Object.keys(groups))groups[b].sort((a, c)=>(leanOf(a) ?? 0) - (leanOf(c) ?? 0));
    // Reihenfolge im Uhrzeigersinn (0°=oben, 90°=rechts, 180°=unten, 270°=links):
    // Neutral (oben) → Ja (rechts) → Unbewertet (unten) → Nein (links).
    const order = [
        "neutral",
        "yes",
        "unrated",
        "no"
    ];
    const present = order.filter((b)=>groups[b].length);
    const G = present.length;
    // Multi-Level nur, wenn Sublevel erlaubt UND vorhanden — steuert die etwas
    // breitere Spannungslücke unten (SEAM_GAP_EXTRA).
    const multiLevel = cap > 1 && (root.children ?? []).some((c)=>(c.children?.length ?? 0) > 0);
    // Lücke NACH jedem präsenten Block (zyklisch). Basis = BLOCK_GAP_DEG; die Naht
    // unten zwischen Ja- und Nein-Seite (Spannungslücke) bekommt im Multi-Level einen
    // Tick extra. Höchstens ein Block ⇒ gar keine Lücken (durchgehender Bogen).
    const gapAfter = (i)=>{
        if (G < 2) return 0;
        const b = present[i];
        const n = present[(i + 1) % G];
        const seam = b === "yes" && (n === "unrated" || n === "no") || b === "unrated" && n === "no";
        return BLOCK_GAP_DEG + (seam && multiLevel ? SEAM_GAP_EXTRA : 0);
    };
    const gaps = present.map((_, i)=>gapAfter(i));
    const available = 360 - gaps.reduce((a, g)=>a + g, 0);
    const totalW = present.reduce((s, b)=>s + groups[b].reduce((x, n)=>x + nodeWeight(n), 0), 0) || 1;
    const bounds = {};
    let cur = 0;
    present.forEach((b, i)=>{
        const start = cur;
        for (const n of groups[b]){
            const w = available * nodeWeight(n) / totalW;
            place(n, 1, cur, cur + w);
            cur += w;
        }
        bounds[b] = [
            start,
            cur
        ];
        cur += gaps[i]; // Lücke nach jedem Block (Ring ⇒ auch nach dem letzten)
    });
    // Rotation: anchorRaw (Roh-Winkel) soll nach unten (180°). Mit beiden Polen ist
    // das die Naht zwischen Ja-Ende und Nein-Start (durch die Unbewertet-Zone);
    // sonst Neutral- bzw. den einzigen Block oben. anchorRaw − 180 ⇒ Block oben.
    let anchorRaw;
    if (bounds.yes && bounds.no) {
        anchorRaw = (bounds.yes[1] + bounds.no[0]) / 2;
    } else if (bounds.neutral) {
        anchorRaw = (bounds.neutral[0] + bounds.neutral[1]) / 2 - 180;
    } else if (present.length) {
        const o = bounds[present[0]];
        anchorRaw = (o[0] + o[1]) / 2 - 180;
    } else {
        anchorRaw = 180;
    }
    const rot = 180 - anchorRaw;
    for (const s of segs){
        const span = s.a1 - s.a0;
        const a0 = ((s.a0 + rot) % 360 + 360) % 360; // a0 ∈ [0,360); a1 = a0+span (ggf. >360)
        s.a0 = a0;
        s.a1 = a0 + span;
    }
    // Mittel-Winkel je befülltem Pol/Neutral-Block (post-Rotation, normalisiert) für
    // die äusseren Block-Labels. Unbewertet bekommt kein Label.
    const blocks = [
        "no",
        "neutral",
        "yes"
    ].filter((b)=>bounds[b]).map((b)=>{
        const [s0, s1] = bounds[b];
        return {
            block: b,
            mid: (((s0 + s1) / 2 + rot) % 360 + 360) % 360
        };
    });
    return {
        segs,
        maxLevel,
        blocks
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
    _s();
    const [hover, setHover] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    // Unterthemen (Ebene 2+) standardmässig EINGEBLENDET; per Checkbox abschaltbar.
    const [showSub, setShowSub] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    // Unterebenen standardmässig KOMPAKT (wie mobil: Ebene 2/3 als dünne Bänder, keine
    // Labels) — auch auf dem Desktop. Die Checkbox klappt sie zur vollen Darstellung
    // auf (proportionale Ringe + Labels ab Ebene 2).
    const [expandSub, setExpandSub] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    // Gibt es überhaupt Unterthemen? Sonst ist die Checkbox sinnlos.
    const hasSub = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TaxonomySunburst.useMemo[hasSub]": ()=>(root.children ?? []).some({
                "TaxonomySunburst.useMemo[hasSub]": (c)=>(c.children?.length ?? 0) > 0
            }["TaxonomySunburst.useMemo[hasSub]"])
    }["TaxonomySunburst.useMemo[hasSub]"], [
        root
    ]);
    // Aggregierte Haltung je Knoten — zentrale Funktion (Schalter in lib/aggregate.ts).
    // Live-Update: `root` wechselt die Referenz bei jeder Bewertung ⇒ Neuberechnung.
    // Vor dem Layout berechnet, weil die Block-Gruppierung den lean braucht.
    const leanMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TaxonomySunburst.useMemo[leanMap]": ()=>{
            const m = new Map();
            const walk = {
                "TaxonomySunburst.useMemo[leanMap].walk": (n)=>{
                    m.set(n.id, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nodeLeaning"])(n));
                    for (const c of n.children ?? [])walk(c);
                }
            }["TaxonomySunburst.useMemo[leanMap].walk"];
            walk(root);
            return m;
        }
    }["TaxonomySunburst.useMemo[leanMap]"], [
        root
    ]);
    const leanOf = (n)=>leanMap.get(n.id) ?? null;
    // Mobil ODER „nicht aufgeklappt" ⇒ kompakte Ring-Geometrie: Ring 1 gross, Ebene
    // 2/3 als dünne Bänder. Aufgeklappt (Desktop) ⇒ proportionale Ringe.
    const subCompact = compact || !expandSub;
    const { segs, radii, maxLevel, centerR, blocks } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TaxonomySunburst.useMemo": ()=>{
            const { segs, maxLevel, blocks } = layout(root, showSub ? MAX_LEVELS : 1, leanOf);
            const centerR = centerRadius(maxLevel, subCompact);
            const radii = ringRadii(maxLevel, centerR, subCompact);
            return {
                segs,
                radii,
                maxLevel,
                centerR,
                blocks
            };
        // leanOf schliesst über leanMap (in den Deps); root-Wechsel ⇒ neuer leanMap.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }
    }["TaxonomySunburst.useMemo"], [
        root,
        compact,
        showSub,
        subCompact,
        leanMap
    ]);
    if (!segs.length) return null;
    // Chart-Breite (max-width des Containers, per w-full responsiv): grosszügig, damit
    // das Rad die Card-Breite nutzt. Einebenig etwas schmaler als mehrebenig.
    const chartMaxW = maxLevel <= 1 ? 700 : 1000;
    // Ring-1-Labels auf eine feste gerenderte Grösse (CSS-px) bringen, unabhängig von
    // viewBox-Breite (VIEW_PAD_X) und chartMaxW: rendered_px = labelFont·chartMaxW/VBW
    // ⇒ labelFont = RING1_LABEL_PX·VBW/chartMaxW.
    const RING1_LABEL_PX = 16;
    const labelFont = compact ? 13 : RING1_LABEL_PX * (SIZE + 2 * VIEW_PAD_X) / chartMaxW;
    // Standardmässig kein Panel; nur beim Hover erscheint Titel + Bewertung seitlich.
    const active = hover;
    const lean = active ? leanOf(active) : null;
    // Hover zeigt Thema + aggregierte Haltung (in Prozentpunkten); unbewertet:
    // Hinweistext.
    const ratingLabel = active ? lean == null ? t("sunburstLeanUnrated") : `⌀ ${signed(lean)}` : "";
    // Farbe = Seite (blau/rot), abgedunkelt für Lesbarkeit.
    const ratingColor = lean == null ? "rgba(0,0,0,0.5)" : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rgbStr"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["mixRgb"])(lean >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ARM_YES"] : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ARM_NO"], [
        30,
        30,
        30
    ], 0.1));
    // Gespalten (hoher dissent) ⇒ Amber-Hinweis im Panel, passend zum Amber-Rand.
    const activeSplit = !!active && (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nodeDissent"])(active) > SPLIT_THRESHOLD;
    // Panel auf die dem Segment gegenüberliegende Seite legen (Winkel 0–180 = rechte
    // Hälfte → Panel links, sonst rechts), damit es das aktive Segment nicht verdeckt.
    const activeSeg = active ? segs.find((s)=>s.node === active) : undefined;
    // a1 kann nach der Layout-Rotation > 360 sein ⇒ Mittelwinkel normalisieren.
    const activeMid = activeSeg ? ((activeSeg.a0 + activeSeg.a1) / 2 % 360 + 360) % 360 : 0;
    const panelSide = activeMid > 0 && activeMid < 180 ? "left" : "right";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
        className: "border-black/5 py-6",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "px-6",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                    children: t("sunburstEyebrow")
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 579,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mb-1.5 flex items-start justify-between gap-3",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-[1.5rem] leading-tight tracking-tight text-foreground",
                            style: SERIF,
                            children: t("sunburstTitle")
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 583,
                            columnNumber: 11
                        }, this),
                        hasSub && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex shrink-0 flex-col items-end gap-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "flex cursor-pointer items-center gap-1.5 text-[12.5px] text-muted-foreground select-none",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "checkbox",
                                            className: "h-3.5 w-3.5 cursor-pointer accent-current",
                                            checked: showSub,
                                            onChange: (e)=>setShowSub(e.target.checked)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                            lineNumber: 592,
                                            columnNumber: 17
                                        }, this),
                                        t("sunburstSubtopics")
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 591,
                                    columnNumber: 15
                                }, this),
                                !compact && showSub && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "flex cursor-pointer items-center gap-1.5 text-[12.5px] text-muted-foreground select-none",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "checkbox",
                                            className: "h-3.5 w-3.5 cursor-pointer accent-current",
                                            checked: expandSub,
                                            onChange: (e)=>setExpandSub(e.target.checked)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                            lineNumber: 604,
                                            columnNumber: 19
                                        }, this),
                                        t("sunburstSubLabels")
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 603,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 590,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 582,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mb-3 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground",
                    children: t("sunburstSubtitle")
                }, void 0, false, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 616,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `relative w-full ${compact ? "-mx-4 max-w-none" : "mx-auto"}`,
                    style: compact ? undefined : {
                        maxWidth: chartMaxW
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                            viewBox: `${-VIEW_PAD_X} ${-VIEW_PAD_Y} ${SIZE + 2 * VIEW_PAD_X} ${SIZE + 2 * VIEW_PAD_Y}`,
                            className: "h-auto w-full",
                            role: "img",
                            "aria-label": t("sunburstTitle"),
                            children: [
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
                                    const split = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$aggregate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nodeDissent"])(s.node) > SPLIT_THRESHOLD;
                                    const clickable = !!s.node.key && !!onSelect;
                                    const mid = (s.a0 + s.a1) / 2;
                                    // a1 kann nach der Rotation > 360 sein; polar() ist periodisch (mid roh
                                    // ok), aber Halbkreis-/Flip-Entscheidungen brauchen mid ∈ [0,360).
                                    const midN = (mid % 360 + 360) % 360;
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
                                    // Ring 1 immer; tiefere Ringe nur im Desktop UND wenn aufgeklappt
                                    // (compact/mobil: nie tiefer als Ring 1). Im kompakten Modus sind die
                                    // Bänder ohnehin < 22px dick ⇒ greift auch die Dicke-Schranke.
                                    const showLabel = span >= LABEL_MIN_ANGLE && thickness > 22 && (s.level === 1 || !compact && expandSub);
                                    // Radiale Ausrichtung (tiefere Ringe): tangential gedreht, links gespiegelt.
                                    let rot = mid - 90;
                                    if (midN > 180) rot += 180;
                                    // Untere Hälfte: Text-Pfad umkehren, sonst stünde der Text kopfüber.
                                    const flip = midN > 90 && midN < 270;
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                d: arcPath(rInner, rOuter, pa0, pa1),
                                                fill: unrated ? "transparent" : fillFor(lean),
                                                // Bewertet ⇒ heller Kartenrand (var(--card), wie die
                                                // Balken-Separatoren, strokeWidth 1.5) für eine saubere Kante
                                                // gegen die Nachbarn; zusammen mit RING_GAP trägt er die
                                                // Struktur (kein Track-Ring mehr). Unbewertet ⇒ transparent mit
                                                // gestricheltem, „provisorischem" Rand.
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
                                                lineNumber: 738,
                                                columnNumber: 19
                                            }, this),
                                            split && (()=>{
                                                const [bx, by] = polar(rInner + 10, mid);
                                                const k = 0.6; // 24er-Icon → ~14 px
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                    d: "M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z",
                                                    fill: AMBER,
                                                    transform: `translate(${bx} ${by}) scale(${k}) translate(-12 -12)`,
                                                    style: {
                                                        pointerEvents: "none"
                                                    },
                                                    opacity: hover && hover !== s.node ? 0.82 : 1
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                    lineNumber: 768,
                                                    columnNumber: 25
                                                }, this);
                                            })(),
                                            showLabel && curved && lines.map((line, i)=>{
                                                const n = lines.length;
                                                // Mehrzeilig: Zeilen radial um die Ring-Mittellinie verteilen.
                                                const ri = labelR + (flip ? -1 : 1) * ((n - 1) / 2 - i) * (11 * segScale);
                                                const pid = `lp-${s.node.id}-${s.level}-${i}`;
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                            id: pid,
                                                            d: textArcPath(ri, s.a0, s.a1, flip),
                                                            fill: "none"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                            lineNumber: 788,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                                            fill: textColor(lean),
                                                            fontSize: segFont,
                                                            style: {
                                                                pointerEvents: "none",
                                                                userSelect: "none"
                                                            },
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textPath", {
                                                                href: `#${pid}`,
                                                                startOffset: "50%",
                                                                textAnchor: "middle",
                                                                children: line
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                                lineNumber: 801,
                                                                columnNumber: 29
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                            lineNumber: 793,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, pid, true, {
                                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                    lineNumber: 787,
                                                    columnNumber: 25
                                                }, this);
                                            }),
                                            showLabel && !curved && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
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
                                                children: lines.map((line, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tspan", {
                                                        x: lx,
                                                        dy: i === 0 ? `${-(lines.length - 1) * 0.55}em` : "1.1em",
                                                        children: line
                                                    }, `${i}-${line}`, false, {
                                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                        lineNumber: 824,
                                                        columnNumber: 25
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                lineNumber: 813,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, `${s.node.id}-${s.level}`, true, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 737,
                                        columnNumber: 17
                                    }, this);
                                }),
                                blocks.map(({ block, mid })=>{
                                    const [bx0, by0] = polar(BLOCK_LABEL_R, mid);
                                    const rad = (mid - 90) * Math.PI / 180;
                                    const dx = Math.cos(rad);
                                    const dy = Math.sin(rad);
                                    const anchor = dx > 0.25 ? "start" : dx < -0.25 ? "end" : "middle";
                                    const baseline = dy > 0.25 ? "hanging" : dy < -0.25 ? "auto" : "central";
                                    // Seitliche (linke/rechte) Labels etwas nach innen und nach unten
                                    // rücken, damit die langen „Meine …"-Labels nicht an den Rand stossen.
                                    const horiz = Math.abs(dx) > 0.25;
                                    const bx = horiz ? bx0 - Math.sign(dx) * 10 : bx0;
                                    const by = horiz ? by0 + 10 : by0;
                                    const { key, color } = BLOCK_LABEL[block];
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                                        x: bx,
                                        y: by,
                                        textAnchor: anchor,
                                        dominantBaseline: baseline,
                                        fontSize: BLOCK_LABEL_FONT,
                                        fontWeight: 600,
                                        fill: color,
                                        style: {
                                            letterSpacing: "0.02em",
                                            pointerEvents: "none",
                                            userSelect: "none"
                                        },
                                        children: t(key)
                                    }, `blk-${block}`, false, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 861,
                                        columnNumber: 17
                                    }, this);
                                }),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                    cx: CX,
                                    cy: CY,
                                    r: centerR,
                                    fill: "var(--card)",
                                    stroke: "rgba(0,0,0,0.05)"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 883,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 624,
                            columnNumber: 11
                        }, this),
                        active && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "pointer-events-none absolute top-1/2 z-10 max-w-[44%] -translate-y-1/2",
                            style: panelSide === "left" ? {
                                left: "2%"
                            } : {
                                right: "2%"
                            },
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-xl border border-black/10 bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm font-medium leading-snug text-foreground/90",
                                        children: active.name
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 901,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-0.5 text-xs font-semibold leading-snug",
                                        style: {
                                            color: ratingColor
                                        },
                                        children: ratingLabel
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 904,
                                        columnNumber: 17
                                    }, this),
                                    activeSplit && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 flex items-center gap-1.5 text-xs font-medium leading-snug",
                                        style: {
                                            color: AMBER
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                viewBox: "0 0 24 24",
                                                className: "h-3.5 w-3.5 shrink-0",
                                                "aria-hidden": "true",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                    d: "M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z",
                                                    fill: AMBER
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                    lineNumber: 920,
                                                    columnNumber: 23
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                                lineNumber: 915,
                                                columnNumber: 21
                                            }, this),
                                            t("sunburstDissentNote")
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 911,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                lineNumber: 900,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 896,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 620,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-5 border-t border-black/5 pt-4 flex items-center justify-center gap-3 text-[13px] font-medium",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                color: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rgbStr"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ARM_NO"])
                            },
                            children: t("poleOpponents")
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 935,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "h-2.5 w-44 rounded-full",
                            style: {
                                background: LEGEND_GRADIENT
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 936,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                color: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rgbStr"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chart$2d$palette$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ARM_YES"])
                            },
                            children: t("poleSupporters")
                        }, void 0, false, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 940,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 934,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex items-center gap-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    viewBox: "2 2.7 16 8",
                                    className: "h-3.5 w-7 shrink-0",
                                    "aria-hidden": "true",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        d: "M 4.84 4.63 A 9 9 0 0 1 15.16 4.63 L 12.29 8.72 A 4 4 0 0 0 7.71 8.72 Z",
                                        fill: "transparent",
                                        stroke: "rgba(0,0,0,0.2)",
                                        strokeWidth: 1.2,
                                        strokeDasharray: "2 1.6",
                                        strokeLinejoin: "round"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 952,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 947,
                                    columnNumber: 13
                                }, this),
                                t("sunburstLeanUnrated")
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 946,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex items-center gap-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    viewBox: "0 0 24 24",
                                    className: "h-4 w-4 shrink-0",
                                    "aria-hidden": "true",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        d: "M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z",
                                        fill: AMBER
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                        lineNumber: 969,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                                    lineNumber: 964,
                                    columnNumber: 13
                                }, this),
                                t("sunburstDissentNote")
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                            lineNumber: 963,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/taxonomy-sunburst.tsx",
                    lineNumber: 945,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/taxonomy-sunburst.tsx",
            lineNumber: 578,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/taxonomy-sunburst.tsx",
        lineNumber: 577,
        columnNumber: 5
    }, this);
}
_s(TaxonomySunburst, "FhdEGjK0GdYif5eHsXeYT2MAhc8=");
_c = TaxonomySunburst;
const __TURBOPACK__default__export__ = TaxonomySunburst;
var _c;
__turbopack_context__.k.register(_c, "TaxonomySunburst");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/locked-section.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GatePlaceholder",
    ()=>GatePlaceholder,
    "LockedSection",
    ()=>LockedSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lock$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Lock$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/lock.js [app-client] (ecmascript) <export default as Lock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-client] (ecmascript)");
;
;
;
;
function LockedSection({ unlocked, placeholder, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: unlocked ? children : placeholder
    }, void 0, false);
}
_c = LockedSection;
function GatePlaceholder({ icon, title, description, progress, className }) {
    const pct = progress && progress.total > 0 ? Math.round(Math.min(progress.value, progress.total) / progress.total * 100) : 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("border-dashed", className),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "flex flex-col items-center gap-3 py-10 text-center",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground",
                    children: icon ?? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lock$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Lock$3e$__["Lock"], {
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                    className: "text-base font-semibold tracking-tight text-foreground",
                    children: title
                }, void 0, false, {
                    fileName: "[project]/src/components/locked-section.tsx",
                    lineNumber: 53,
                    columnNumber: 9
                }, this),
                description && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "max-w-md text-sm leading-relaxed text-muted-foreground",
                    children: description
                }, void 0, false, {
                    fileName: "[project]/src/components/locked-section.tsx",
                    lineNumber: 57,
                    columnNumber: 11
                }, this),
                progress && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-1 flex w-full max-w-xs flex-col items-center gap-1.5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-1.5 w-full overflow-hidden rounded-full bg-muted",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                        progress.label && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
_c1 = GatePlaceholder;
var _c, _c1;
__turbopack_context__.k.register(_c, "LockedSection");
__turbopack_context__.k.register(_c1, "GatePlaceholder");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/argumentarium-header.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ArgumentariumHeader",
    ()=>ArgumentariumHeader,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Header der beiden Argument-Views (booklet, taxonomy): eine ruhige Meta-Zeile
 * (Themen · Argumente · Kommentare) mit dem ViewToggle rechts daneben, plus ein
 * kurzer Einführungstext. Der Vorlagentitel steht im globalen Titelband
 * (ballot/[id]/layout.tsx) — hier bewusst kein eigener Sektionstitel mehr.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
function ArgumentariumHeader({ ballot, // Anzahl Top-Themen — nur die Taxonomy-View liefert das; dann erscheint in der
// Meta-Zeile zusätzlich „… Themen". Booklet lässt es weg.
topicCount, // Optionaler Controls-Slot (z. B. ViewToggle) — sitzt rechts auf der
// Überschriftenzeile, gekoppelt an den Inhalt, den er umschaltet.
actions }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("argumentarium");
    const tbk = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("booklet");
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-1 pt-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `flex items-center gap-4 ${metaParts.length > 0 ? "justify-between" : "justify-end"}`,
                children: [
                    metaParts.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[0.875rem] text-[var(--text-mid)]",
                        children: metaParts.map((part, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    i > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "mx-1.5",
                                        children: "·"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/argumentarium-header.tsx",
                                        lineNumber: 57,
                                        columnNumber: 27
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                    actions && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
_s(ArgumentariumHeader, "j1yC0EjtO8ZjIXH5cJL+6YCouzQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = ArgumentariumHeader;
const __TURBOPACK__default__export__ = ArgumentariumHeader;
var _c;
__turbopack_context__.k.register(_c, "ArgumentariumHeader");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TaxonomyPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/queries/taxonomy.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$rating$2d$gate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/queries/rating-gate.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/overlay/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$use$2d$overlay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/overlay/use-overlay.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/alert.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/spinner.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$view$2d$toggle$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/view-toggle.tsx [app-client] (ecmascript)");
// import { PageBackdrop } from "@/components/page-backdrop";
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$diverging$2d$likert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/diverging-likert.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$sunburst$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/taxonomy-sunburst.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$locked$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/locked-section.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$add$2d$argument$2d$modal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/add-argument-modal.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$argumentarium$2d$header$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/argumentarium-header.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$view$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/taxonomy-view.tsx [app-client] (ecmascript)");
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
function TaxonomyPage() {
    _s();
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"])();
    const id = params.id;
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"])();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("taxonomy");
    const tc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])("common");
    const { navigate } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$use$2d$overlay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOverlay"])();
    const [addOpen, setAddOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const openArgument = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "TaxonomyPage.useCallback[openArgument]": (rkey)=>navigate({
                type: "argument",
                rkey
            })
    }["TaxonomyPage.useCallback[openArgument]"], [
        navigate
    ]);
    // „Mehr anzeigen" eines Top-Topics → Detail-Overlay (Subtopics + alle Argumente).
    const openTopicDetail = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "TaxonomyPage.useCallback[openTopicDetail]": (topic)=>navigate({
                type: "taxonomy",
                ballotRkey: id,
                topic
            })
    }["TaxonomyPage.useCallback[openTopicDetail]"], [
        navigate,
        id
    ]);
    // Ballot + Taxonomie aus dem zentralen Query-Cache. Eine Bewertung im Overlay
    // patcht die `["taxonomy", id, …]`-Einträge (siehe useArgumentRatingCache),
    // sodass die Karten hier ohne Refetch live aktualisieren.
    const enabled = !!id;
    const { data: ballot = null, isPending: ballotPending, error: ballotError, refetch: refetchBallot } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "ballot",
            id,
            locale
        ],
        queryFn: {
            "TaxonomyPage.useQuery": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getBallot"])(id, locale)
        }["TaxonomyPage.useQuery"],
        enabled
    });
    const { data: tax = null, isPending: taxPending, error: taxError, refetch: refetchBase } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTaxonomyBase"])(id, locale, enabled);
    const { data: fullTree = null, refetch: refetchFull } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTaxonomyFull"])(id, locale, enabled);
    // Bewertungs-Gate: die Analyse-Sektion (Sunburst + Positionsband) wird erst
    // freigeschaltet, wenn der Nutzer in jedem Top-Thema genügend bewertet hat.
    // Leitet sich live aus demselben Taxonomie-Cache ab (kein Refetch nötig).
    const gate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$rating$2d$gate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRatingGate"])(id, locale, enabled);
    const loading = ballotPending || taxPending;
    const queryError = ballotError ?? taxError;
    const error = queryError ? queryError instanceof Error ? queryError.message : String(queryError) : null;
    const reload = ()=>{
        refetchBallot();
        refetchBase();
        refetchFull();
    };
    const root = tax?.tree;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-5 pb-[35vh]",
        children: [
            ballot && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$argumentarium$2d$header$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ArgumentariumHeader"], {
                ballot: ballot,
                topicCount: root?.children?.length,
                actions: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$view$2d$toggle$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ViewToggle"], {
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
            loading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "flex items-center justify-center gap-3 py-10",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$spinner$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Spinner"], {}, void 0, false, {
                            fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                            lineNumber: 111,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Alert"], {
                variant: "destructive",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDescription"], {
                    className: "flex items-center justify-between",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
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
            !loading && !error && !root && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
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
            !loading && root && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col gap-5",
                children: [
                    root.children.map((ch, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$view$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ThemeCard"], {
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
                    root.arguments.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                        className: "border-black/5",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                            className: "pt-6",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mb-2 text-sm font-medium text-muted-foreground",
                                    children: t("other")
                                }, void 0, false, {
                                    fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                    lineNumber: 155,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$view$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ProContraArguments"], {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$locked$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LockedSection"], {
                        unlocked: gate.unlocked,
                        placeholder: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$locked$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GatePlaceholder"], {
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
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                                className: "mt-6 mb-1 px-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        className: "text-lg font-semibold tracking-tight text-foreground",
                                        children: t("analysisTitle")
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx",
                                        lineNumber: 188,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                            fullTree?.tree && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "hidden md:block",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$sunburst$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TaxonomySunburst"], {
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
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "-mx-2 md:hidden",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$taxonomy$2d$sunburst$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TaxonomySunburst"], {
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
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$diverging$2d$likert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DivergingLikert"], {
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
            ballot && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$add$2d$argument$2d$modal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AddArgumentModal"], {
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
_s(TaxonomyPage, "TRIcgjB4du9uUQh3JNvvn2bKE50=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$overlay$2f$use$2d$overlay$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOverlay"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTaxonomyBase"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$taxonomy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTaxonomyFull"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$queries$2f$rating$2d$gate$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRatingGate"]
    ];
});
_c = TaxonomyPage;
var _c;
__turbopack_context__.k.register(_c, "TaxonomyPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_2c59d4d4._.js.map