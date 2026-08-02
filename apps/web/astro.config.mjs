import { RULES_VERIFIED_AT } from '@530a/config'
import preact from '@astrojs/preact'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import { updates } from './src/data/updates'

// Per-path lastmod where a page has a truer date than the rules-verified
// default (a uniform lastmod tells crawlers nothing about what changed).
const LASTMOD = {
  '/updates/': updates[0]?.date ?? RULES_VERIFIED_AT,
}

export default defineConfig({
  site: 'https://530amodel.com',
  output: 'static',
  integrations: [
    preact({ compat: false }),
    sitemap({
      filter: (page) => !page.includes('/admin'),
      serialize: (item) => {
        const path = new URL(item.url).pathname
        return { ...item, lastmod: LASTMOD[path] ?? RULES_VERIFIED_AT }
      },
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
})
