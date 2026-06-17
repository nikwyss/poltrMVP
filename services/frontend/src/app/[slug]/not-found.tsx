import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations('notFound')
  return (
    <div className="not-found">
      <h1>{t('title')}</h1>
      <p>{t('message')}</p>
      <Link href="/">{t('backHome')}</Link>
    </div>
  )
}
