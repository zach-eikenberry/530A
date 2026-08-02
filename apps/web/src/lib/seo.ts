import { CANONICAL_ORIGIN, type PageFaq, RULES_VERIFIED_AT } from '@530a/config'

/** Stable JSON-LD node ids so page-level blocks join one entity graph. */
export const ORG_ID = `${CANONICAL_ORIGIN}/#organization`
export const WEBSITE_ID = `${CANONICAL_ORIGIN}/#website`
export const APP_ID = `${CANONICAL_ORIGIN}/#app`

export const GITHUB_URL = 'https://github.com/zach-eikenberry/530A'

/** Date the site first published its content pages (earliest /updates entry). */
export const SITE_PUBLISHED = '2026-07-12'

/**
 * One canonical URL convention: trailing slash (matching what Cloudflare
 * Pages actually serves for directory-format builds), used by canonicals,
 * OG urls, and JSON-LD alike.
 */
export function canonicalUrl(path: string): string {
  const clean = path === '/' ? '' : path.replace(/\/$/, '')
  return `${CANONICAL_ORIGIN}${clean}/`
}

/** Article/TechArticle node for a content page, linked to the site entities. */
export function articleLd(opts: {
  headline: string
  description: string
  path: string
  type?: 'Article' | 'TechArticle'
  datePublished?: string
  dateModified?: string
}) {
  const url = canonicalUrl(opts.path)
  return {
    '@context': 'https://schema.org',
    '@type': opts.type ?? 'Article',
    '@id': `${url}#article`,
    headline: opts.headline,
    description: opts.description,
    url,
    mainEntityOfPage: url,
    datePublished: opts.datePublished ?? SITE_PUBLISHED,
    dateModified: opts.dateModified ?? RULES_VERIFIED_AT,
    author: { '@id': ORG_ID },
    inLanguage: 'en',
    isPartOf: { '@id': WEBSITE_ID },
    publisher: { '@id': ORG_ID },
  }
}

/**
 * FAQPage node for a page's Q&A set. Entries owned by another page (shared
 * canonical answers) are excluded here so each question is marked up on
 * exactly one URL.
 */
export function faqPageLd(faqs: readonly PageFaq[], path: string) {
  const owned = faqs.filter((f) => !f.ownedBy || f.ownedBy === path)
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: owned.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

/** Stable, readable anchor id for a question or heading. */
export function anchorId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’'".,?!()§—–]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "2026-07-12" → "July 12, 2026" (ISO stays in <time datetime>). */
export function humanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${MONTHS[m - 1]} ${d}, ${y}`
}
