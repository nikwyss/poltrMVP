import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getPage, getPages } from '@/lib/cms'
import { RichText } from '@/components/RichText'

interface PageProps {
  params: Promise<{ slug: string }>
}

// Generate static paths for known pages (optional, for SSG)
export async function generateStaticParams() {
  const pages = await getPages()
  return pages.map((page) => ({ slug: page.slug }))
}

// Generate metadata from CMS
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = await getPage(slug)

  if (!page) {
    return { title: 'Page Not Found' }
  }

  return {
    title: page.meta?.title || page.title,
    description: page.meta?.description || page.excerpt,
    openGraph: page.meta?.image?.url
      ? { images: [{ url: page.meta.image.url }] }
      : undefined,
  }
}

export default async function CMSPage({ params }: PageProps) {
  const { slug } = await params
  const page = await getPage(slug)

  if (!page) {
    notFound()
  }

  return (
    <article className="cms-page">
      <header>
        <h1>{page.title}</h1>
        {page.excerpt && <p className="excerpt">{page.excerpt}</p>}
      </header>

      <RichText content={page.content} className="content" />
    </article>
  )
}
