"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { useAuth } from "@/lib/AuthContext"
import { AppNav } from "@/components/app-nav"
import { Spinner } from "@/components/spinner"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const tc = useTranslations("common")

  useEffect(() => {
    if (!loading && !isAuthenticated) {
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
    <div className="flex min-h-screen flex-col bg-background">
      <AppNav />
      <main className="mx-auto w-full flex-1" style={{ maxWidth: 'var(--page-max)', padding: '0 var(--page-px) 100px' }}>
        {children}
      </main>
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
