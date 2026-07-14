import preact from '@astrojs/preact'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://530amodel.com',
  output: 'static',
  integrations: [
    preact({ compat: false }),
    sitemap({ filter: (page) => !page.includes('/admin') }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
})
