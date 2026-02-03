import type { CollectionConfig } from 'payload'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'status', 'updatedAt'],
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
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'URL-friendly identifier (e.g., "about-us")',
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
      name: 'excerpt',
      type: 'textarea',
      admin: {
        description: 'Short summary for listings and previews',
      },
    },
    {
      type: 'group',
      name: 'meta',
      label: 'SEO & Meta',
      fields: [
        {
          name: 'title',
          type: 'text',
          admin: {
            description: 'Override the page title for SEO (optional)',
          },
        },
        {
          name: 'description',
          type: 'textarea',
          admin: {
            description: 'Meta description for search engines',
          },
        },
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          admin: {
            description: 'Social sharing image',
          },
        },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === 'create' && data.status === 'published' && !data.publishedAt) {
          data.publishedAt = new Date().toISOString()
        }
        return data
      },
    ],
  },
}
