"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Search, X, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/spinner";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useBallotSearch } from "@/lib/queries/search";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/types/search";

// Search field that lives in the header centre. The header sits OUTSIDE the
// `OverlayProvider` (which is scoped to /ballot/[id]/*), so we cannot call
// `useOverlay()` here. Instead we open overlays the same way the URL stores
// them: by pushing a `?ov=<type>:<id>` param — the provider reads it reactively.

function entryParam(r: SearchResult): string {
  switch (r.type) {
    case "argument":
      return `argument:${r.rkey}`;
    case "comment":
      return `comment:${r.uri}`;
    case "taxonomy":
      return `taxonomy:${r.ballotRkey}:${r.topic}`;
  }
}

// Split plaintext on the (case-insensitive) search term and wrap matches.
function Highlight({ text, term }: { text: string; term: string }) {
  const needle = term.trim();
  if (!needle) return <>{text}</>;
  const lower = text.toLowerCase();
  const ln = needle.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const hit = lower.indexOf(ln, i);
    if (hit < 0) {
      out.push(text.slice(i));
      break;
    }
    if (hit > i) out.push(text.slice(i, hit));
    out.push(
      <mark key={k++} className="bg-transparent font-semibold text-[var(--text)]">
        {text.slice(hit, hit + needle.length)}
      </mark>,
    );
    i = hit + needle.length;
  }
  return <>{out}</>;
}

export function BallotSearch() {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("search");

  const ballotRkey =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : "";

  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const { debounced } = useDebouncedCallback((v: string) => setQuery(v), 200);

  const { data, isFetching } = useBallotSearch(ballotRkey, locale, query);

  // Flat, ordered list (Themen → Argumente → Kommentare) for keyboard nav.
  const flat = useMemo<SearchResult[]>(() => {
    if (!data) return [];
    return [...data.results.taxonomy, ...data.results.argument, ...data.results.comment];
  }, [data]);

  const hasResults = flat.length > 0;
  const showPanel = query.trim().length >= 2;

  useEffect(() => {
    setActiveIndex(-1);
  }, [query, data]);

  const onChange = useCallback(
    (v: string) => {
      setInputValue(v);
      debounced(v);
      setOpen(true);
    },
    [debounced],
  );

  // Close the dropdown / mobile overlay but KEEP the typed term so the user can
  // refine or reuse it (focusing the field reopens the cached results).
  const closePanels = useCallback(() => {
    setOpen(false);
    setMobileOpen(false);
    setActiveIndex(-1);
  }, []);

  // Empty the field (X button) without closing the panel; refocus so the user
  // can keep typing.
  const clearField = useCallback(() => {
    setInputValue("");
    setQuery("");
    setActiveIndex(-1);
    (mobileOpen ? mobileInputRef : desktopInputRef).current?.focus();
  }, [mobileOpen]);

  const openResult = useCallback(
    (r: SearchResult) => {
      const qp = new URLSearchParams(searchParams.toString());
      qp.delete("ov");
      qp.append("ov", entryParam(r));
      // Open the overlay the same way the provider does (it reads `?ov=` from
      // the URL). `scroll: false` keeps the page from jumping to the top.
      router.push(`${pathname}?${qp.toString()}`, { scroll: false });
      // Keep the search term in the field; just dismiss the result panel.
      closePanels();
    },
    [pathname, searchParams, router, closePanels],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const pick = activeIndex >= 0 ? flat[activeIndex] : flat[0];
        if (pick) {
          e.preventDefault();
          openResult(pick);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePanels();
      }
    },
    [flat, activeIndex, openResult, closePanels],
  );

  // Cmd/Ctrl+K focuses the search field (desktop).
  useEffect(() => {
    if (!ballotRkey) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        desktopInputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ballotRkey]);

  // Click outside closes the desktop dropdown.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Autofocus the mobile input when the overlay opens.
  useEffect(() => {
    if (mobileOpen) mobileInputRef.current?.focus();
  }, [mobileOpen]);

  // Self-gate: only active inside a ballot (needs the ballot rkey).
  if (!ballotRkey) return null;

  const groups: { key: "taxonomy" | "argument" | "comment"; label: string }[] = [
    { key: "taxonomy", label: t("groupThemen") },
    { key: "argument", label: t("groupArgumente") },
    { key: "comment", label: t("groupKommentare") },
  ];

  function renderResults() {
    if (isFetching && !data) {
      return (
        <div className="flex items-center gap-2 px-3 py-4 text-[0.8125rem] text-[var(--text-mid)]">
          <Spinner size="sm" /> {t("loading")}
        </div>
      );
    }
    if (!hasResults) {
      return (
        <div className="px-3 py-4 text-[0.8125rem] text-[var(--text-mid)]">
          {t("noResults", { q: query.trim() })}
        </div>
      );
    }
    let runningIndex = 0;
    return (
      <ul role="listbox" id="ballot-search-listbox" className="py-1">
        {groups.map((g) => {
          const items = data!.results[g.key];
          if (!items.length) return null;
          return (
            <li key={g.key} role="presentation">
              <div className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-mid)]">
                {g.label}
              </div>
              <ul>
                {items.map((r) => {
                  const idx = runningIndex++;
                  const active = idx === activeIndex;
                  return (
                    <li key={`${r.type}:${idx}`} role="option" aria-selected={active}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => openResult(r)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                          active ? "bg-accent" : "hover:bg-accent",
                        )}
                      >
                        <span className="truncate text-[0.8125rem] font-medium text-[var(--text)]">
                          <Highlight text={r.title} term={query} />
                        </span>
                        {r.snippet && (
                          <span className="line-clamp-1 text-[0.75rem] text-[var(--text-mid)]">
                            <Highlight text={r.snippet} term={query} />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      {/* Desktop / tablet: inline field in the header centre */}
      <div
        ref={containerRef}
        className="relative mx-4 hidden max-w-md flex-1 md:block"
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-mid)]" />
        <Input
          ref={desktopInputRef}
          value={inputValue}
          placeholder={t("placeholder")}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open && showPanel}
          aria-controls="ballot-search-listbox"
          aria-autocomplete="list"
          className="h-9 rounded-[var(--r-full)] bg-[var(--surface-up)] pl-8 pr-8"
        />
        {inputValue && (
          <button
            type="button"
            aria-label={t("clear")}
            onClick={clearField}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-mid)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {open && showPanel && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[70vh] overflow-y-auto rounded-[var(--r)] border border-[var(--line)] bg-[var(--bg)] shadow-lg">
            {renderResults()}
          </div>
        )}
      </div>

      {/* Mobile: a magnifier icon that expands into a full-width search overlay */}
      <button
        type="button"
        aria-label={t("placeholder")}
        onClick={() => setMobileOpen(true)}
        className="flex size-[30px] items-center justify-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface)] text-[var(--text-mid)] transition-colors hover:border-[var(--line-mid)] hover:bg-accent md:hidden"
      >
        <Search className="h-4 w-4" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--bg)] md:hidden">
          <div className="flex h-[58px] shrink-0 items-center gap-2 border-b px-3">
            <button
              type="button"
              aria-label={t("close")}
              onClick={closePanels}
              className="flex size-8 items-center justify-center text-[var(--text-mid)]"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-mid)]" />
              <Input
                ref={mobileInputRef}
                value={inputValue}
                placeholder={t("placeholder")}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                role="combobox"
                aria-expanded={showPanel}
                aria-controls="ballot-search-listbox"
                aria-autocomplete="list"
                className="h-9 rounded-[var(--r-full)] bg-[var(--surface-up)] pl-8 pr-8"
              />
              {inputValue && (
                <button
                  type="button"
                  aria-label={t("clear")}
                  onClick={clearField}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-mid)] hover:text-[var(--text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {showPanel ? (
              renderResults()
            ) : (
              <div className="px-3 py-4 text-[0.8125rem] text-[var(--text-mid)]">
                {t("hint")}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
