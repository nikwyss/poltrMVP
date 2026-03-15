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
          backgroundColor: isPro ? '#e8f5e9' : '#ffebee',
          color: isPro ? '#2e7d32' : '#c62828',
        }}
      >
        {isPro ? tc('pro') : tc('contra')}
      </Badge>
    )
  }

  return (
    <Badge
      className="text-xs font-bold text-white"
      style={{ backgroundColor: isPro ? '#16a34a' : '#dc2626' }}
    >
      {isPro ? tc('pro') : tc('contra')}
    </Badge>
  )
}

export function ReviewStatusBadge({ status }: { status?: string }) {
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
