import { RULES_VERIFIED_AT } from '@530a/config'
import preact from '@astrojs/preact'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://530amodel.com',
  output: 'static',
  integrations: [
    preact({ compat: false }),
    sitemap({
      filter: (page) => !page.includes('/admin'),
      serialize: (item) => ({ ...item, lastmod: RULES_VERIFIED_AT }),
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
})
