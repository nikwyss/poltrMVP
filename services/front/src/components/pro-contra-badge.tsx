import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"

export function ProContraBadge({ type, variant = "solid" }: { type?: string; variant?: "solid" | "soft" }) {
  const tc = useTranslations('common')
  if (!type) return null
  const isPro = type === "pro"

  if (variant === "soft") {
    return (
      <Badge
        className="text-xs font-semibold"
        style={{
          backgroundColor: isPro ? 'var(--pro-dim)' : 'var(--contra-dim)',
          color: isPro ? 'var(--pro)' : 'var(--contra)',
        }}
      >
        {isPro ? tc('pro') : tc('contra')}
      </Badge>
    )
  }

  return (
    <Badge
      className="text-xs font-bold text-white"
      style={{ backgroundColor: isPro ? 'var(--pro)' : 'var(--contra)' }}
    >
      {isPro ? tc('pro') : tc('contra')}
    </Badge>
  )
}

const OFFICIAL_SOURCE = "app.ch.poltr.ballot.argument#sourceOfficial"

/** True for arguments curated by the authorities (Bundeskanzlei) — these
 *  bypass peer review and are shown as "Offiziell" rather than a review state. */
export function isOfficialArgument(source?: { $type?: string }): boolean {
  return source?.$type === OFFICIAL_SOURCE
}

export function OfficialBadge() {
  const t = useTranslations('reviewStatus')
  return (
    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-0">
      ★ {t('official')}
    </Badge>
  )
}

export function PeerreviewStatusBadge({ status }: { status?: string }) {
  const t = useTranslations('reviewStatus')
  if (!status) return null

  const config: Record<string, { bg: string; text: string; key: string }> = {
    preliminary: { bg: 'bg-orange-50', text: 'text-orange-800', key: 'preliminary' },
    approved: { bg: 'bg-green-50', text: 'text-green-800', key: 'peerReviewed' },
    rejected: { bg: 'bg-red-50', text: 'text-red-800', key: 'rejected' },
  }

  const c = config[status]
  if (!c) return null

  return (
    <Badge variant="outline" className={`text-xs ${c.bg} ${c.text} border-0`}>
      {t(c.key)}
    </Badge>
  )
}
