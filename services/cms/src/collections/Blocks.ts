import type { CollectionConfig } from 'payload'

export const Blocks: CollectionConfig = {
  slug: 'blocks',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'placement', 'active', 'priority'],
    listSearchableFields: ['title', 'slug'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'Internal name for this block',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Unique identifier for fetching this block',
      },
      validate: (value: unknown) => {
        if (typeof value !== 'string') return 'Slug is required'
        if (!/^[a-z0-9-]+$/.test(value)) {
          return 'Slug can only contain lowercase letters, numbers, and hyphens'
        }
        return true
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
    {
      name: 'placement',
      type: 'select',
      required: true,
      options: [
        { label: 'Homepage', value: 'homepage' },
        { label: 'Header', value: 'header' },
        { label: 'Footer', value: 'footer' },
        { label: 'Sidebar', value: 'sidebar' },
        { label: 'Banner', value: 'banner' },
        { label: 'Modal', value: 'modal' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Where this block should appear',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
        description: 'Whether this block is currently visible',
      },
    },
    {
      name: 'priority',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Higher priority blocks appear first',
      },
    },
  ],
}
