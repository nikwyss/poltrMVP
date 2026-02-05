/**
 * Lightweight Lexical Rich Text Renderer
 * Renders Payload CMS Lexical JSON without needing @payloadcms packages
 */

import React from 'react'

interface LexicalNode {
  type: string
  children?: LexicalNode[]
  text?: string
  format?: number
  tag?: string
  listType?: string
  url?: string
  newTab?: boolean
  relationTo?: string
  value?: { url?: string; alt?: string }
  [key: string]: unknown
}

interface LexicalRoot {
  root: {
    children: LexicalNode[]
  }
}

// Format flags (bitmask)
const IS_BOLD = 1
const IS_ITALIC = 2
const IS_STRIKETHROUGH = 4
const IS_UNDERLINE = 8
const IS_CODE = 16

function renderText(node: LexicalNode): React.ReactNode {
  let text: React.ReactNode = node.text || ''
  const format = node.format || 0

  if (format & IS_CODE) text = <code>{text}</code>
  if (format & IS_BOLD) text = <strong>{text}</strong>
  if (format & IS_ITALIC) text = <em>{text}</em>
  if (format & IS_UNDERLINE) text = <u>{text}</u>
  if (format & IS_STRIKETHROUGH) text = <s>{text}</s>

  return text
}

function renderNode(node: LexicalNode, index: number): React.ReactNode {
  const key = `${node.type}-${index}`
  const children = node.children?.map((child, i) => renderNode(child, i))

  switch (node.type) {
    case 'text':
      return <React.Fragment key={key}>{renderText(node)}</React.Fragment>

    case 'paragraph':
      return <p key={key}>{children}</p>

    case 'heading':
      const HeadingTag = (node.tag || 'h2') as keyof React.JSX.IntrinsicElements
      return <HeadingTag key={key}>{children}</HeadingTag>

    case 'list':
      const ListTag = node.listType === 'number' ? 'ol' : 'ul'
      return <ListTag key={key}>{children}</ListTag>

    case 'listitem':
      return <li key={key}>{children}</li>

    case 'link':
      return (
        <a
          key={key}
          href={node.url as string}
          target={node.newTab ? '_blank' : undefined}
          rel={node.newTab ? 'noopener noreferrer' : undefined}
        >
          {children}
        </a>
      )

    case 'quote':
      return <blockquote key={key}>{children}</blockquote>

    case 'upload':
      const media = node.value as { url?: string; alt?: string } | undefined
      if (media?.url) {
        return (
          <figure key={key}>
            <img src={media.url} alt={media.alt || ''} />
          </figure>
        )
      }
      return null

    case 'horizontalrule':
      return <hr key={key} />

    case 'linebreak':
      return <br key={key} />

    default:
      // For unknown types, just render children
      return children ? <div key={key}>{children}</div> : null
  }
}

interface RichTextProps {
  content: unknown
  className?: string
}

export function RichText({ content, className }: RichTextProps) {
  if (!content || typeof content !== 'object') {
    return null
  }

  const lexical = content as LexicalRoot
  if (!lexical.root?.children) {
    return null
  }

  return (
    <div className={className}>
      {lexical.root.children.map((node, index) => renderNode(node, index))}
    </div>
  )
}
