"use client"

import { useRouter, usePathname } from "next/navigation"
import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { useAuth } from "@/lib/AuthContext"
import { stashReturnTo } from "@/lib/auth-redirect"
import { AppNav } from "@/components/app-nav"
import { Spinner } from "@/components/spinner"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const tc = useTranslations("common")

  // Ballot-Seiten verwalten ihre eigenen vollbreiten Bänder (Tab-Linie + weisse
  // Content-Fläche), daher ohne die zentrierte max-width-/Padding-Hülle rendern.
  const isBallotPage = pathname.startsWith("/ballot/")

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Ursprungs-Link (inkl. ?ov=…) merken, damit der Nutzer nach dem Login
      // wieder hierher zurückgeleitet wird (siehe lib/auth-redirect).
      stashReturnTo(window.location.pathname + window.location.search)
      router.push("/")
    }
  }, [isAuthenticated, loading, router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppNav />
      {isBallotPage ? (
        <main className="flex w-full flex-1 flex-col">{children}</main>
      ) : (
        <main className="mx-auto w-full flex-1" style={{ maxWidth: 'var(--page-max)', padding: '0 var(--page-px) 100px' }}>
          {children}
        </main>
      )}
      <footer className="border-t border-border py-6 text-center label">
        <div className="mx-auto" style={{ maxWidth: 'var(--page-max)', padding: '0 var(--page-px)' }}>
          <a href="/impressum" className="hover:text-foreground transition-colors">
            {tc("impressum")}
          </a>
        </div>
      </footer>
    </div>
  )
}
