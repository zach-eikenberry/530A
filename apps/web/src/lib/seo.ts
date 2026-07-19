import { CANONICAL_ORIGIN, RULES_VERIFIED_AT } from '@530a/config'

/** Stable JSON-LD node ids so page-level blocks join one entity graph. */
export const ORG_ID = `${CANONICAL_ORIGIN}/#organization`
export const WEBSITE_ID = `${CANONICAL_ORIGIN}/#website`

export const GITHUB_URL = 'https://github.com/zach-eikenberry/530A'

/** Article/TechArticle node for a content page, linked to the site entities. */
export function articleLd(opts: {
  headline: string
  description: string
  path: string
  type?: 'Article' | 'TechArticle'
}) {
  const url = `${CANONICAL_ORIGIN}${opts.path}`
  return {
    '@context': 'https://schema.org',
    '@type': opts.type ?? 'Article',
    '@id': `${url}#article`,
    headline: opts.headline,
    description: opts.description,
    url,
    mainEntityOfPage: url,
    dateModified: RULES_VERIFIED_AT,
    inLanguage: 'en',
    isPartOf: { '@id': WEBSITE_ID },
    publisher: { '@id': ORG_ID },
  }
}
