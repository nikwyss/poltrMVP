"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";
import { LogOut, Menu, X, User } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LocaleSwitcher } from "@/components/locale-switcher";

const navKeys = [{ key: "home" as const, href: "/home" }];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const t = useTranslations("nav");
  const [mobileOpen, setMobileOpen] = useState(false);
  const isVorlagePage = pathname.startsWith("/ballot/");

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const initials = user?.handle
    ? user.handle.substring(0, 2).toUpperCase()
    : "?";

  return (
    <header className="sticky top-0 z-50 w-full bg-[var(--bg)]/88 backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--bg)]/60">
      <div className="border-b">
        <nav
          className="mx-auto flex h-[52px] max-w-[var(--page-max)] items-center justify-between"
          style={{ padding: "0 var(--page-px)" }}
        >
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-1.5 no-underline">
            <img src="/logo5.svg" alt="Poltr" className="h-9 w-9 shrink-0" />
            <span className="font-extrabold text-base tracking-tight hidden sm:inline ">
              Poltr
            </span>
          </Link>

          {/* Desktop nav links — hidden when inside a vorlage (sub-nav handles it) */}
          {!isVorlagePage && (
            <div className="hidden sm:flex items-center gap-0.5">
              {navKeys.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "px-3.5 py-1 text-[13px] font-medium rounded-[var(--r-sm)] no-underline transition-all duration-150",
                      isActive
                        ? "bg-[var(--text)] text-[var(--bg)]"
                        : "text-[var(--text-mid)] hover:bg-accent hover:text-[var(--text)]",
                    )}
                  >
                    {t(item.key)}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Right side: locale switcher + user pill + mobile toggle */}
          <div className="flex items-center gap-2">
            <LocaleSwitcher />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--line)] rounded-[var(--r-full)] py-0.5 pl-1 pr-3 text-[12.5px] text-[var(--text-mid)] hover:border-[var(--line-mid)] transition-colors cursor-pointer"
                >
                  <div className="flex size-[22px] items-center justify-center rounded-full bg-accent border border-[var(--line-mid)] text-[8px] font-bold text-[var(--text-mid)]">
                    {initials}
                  </div>
                  <span className="hidden md:inline truncate max-w-[120px]">
                    {user?.displayName || user?.handle}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  {t("profile")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("logOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile hamburger — hidden when inside a vorlage */}
            {!isVorlagePage && (
              <button
                type="button"
                className="sm:hidden flex items-center justify-center size-[30px] rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface)] text-[var(--text-mid)] hover:bg-accent hover:border-[var(--line-mid)] transition-colors cursor-pointer"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Menu className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </nav>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && !isVorlagePage && (
        <div className="sm:hidden border-b bg-[var(--bg)]">
          <div className="flex flex-col py-2 px-4 gap-1">
            {navKeys.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "px-3 py-2 text-[13px] font-medium rounded-[var(--r-sm)] no-underline transition-all",
                    isActive
                      ? "bg-[var(--text)] text-[var(--bg)]"
                      : "text-[var(--text-mid)] hover:bg-accent hover:text-[var(--text)]",
                  )}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
